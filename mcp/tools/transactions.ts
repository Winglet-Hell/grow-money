import type { Transaction } from '../../src/types';
import { isPlannedPayment } from '../../src/lib/categoryGroups';
import { payeeOf, tagsOf } from '../../src/lib/aiExport';
import { resolveTrip } from '../../src/lib/tripUtils';
import { shiftMonthKey } from '../../src/lib/periods';
import type { Context } from '../context';
import {
    dayOf, findTrip, groupOf, isDay, isMonth, legsOf, monthBounds, nativeOf, pct, round, roundNative, rubOf, similarNames, table,
    weekOf, weekdayOf, WEEKDAYS,
} from './common';

// Filter, total and group the operations: the one tool for "how much / what / when" questions the
// precomputed reports don't answer directly.

export const DIMENSIONS = ['category', 'group', 'payee', 'tag', 'account', 'currency', 'month', 'week', 'day', 'weekday', 'year', 'type'] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export type OperationType = 'expense' | 'income' | 'transfer' | 'all';

export interface QueryArgs {
    type?: OperationType;
    month?: string;
    from?: string;
    to?: string;
    categories?: string[];
    groups?: string[];
    accounts?: string[];
    currencies?: string[];
    tags?: string[];
    search?: string;
    min_rub?: number;
    max_rub?: number;
    trip?: string;
    exclude_planned?: boolean;
    group_by?: Dimension[];
    sort?: 'date' | 'amount';
    limit?: number;
}

const TIME_DIMENSIONS = new Set<Dimension>(['month', 'week', 'day', 'year']);
const SINGULAR = { categories: 'category', groups: 'category group', accounts: 'wallet', tags: 'tag' } as const;

function keysOf(t: Transaction, dim: Dimension): string[] {
    const day = dayOf(t);
    switch (dim) {
        case 'category': return [t.type === 'transfer' ? `→ ${t.category || 'Unknown'}` : t.category || 'Uncategorized'];
        case 'group': return [groupOf(t)];
        case 'payee': return [payeeOf(t) ?? '(no tag or note)'];
        case 'tag': { const tags = tagsOf(t); return tags.length ? tags : ['(no tag)']; }
        case 'account': return [t.account || 'Unknown'];
        case 'currency': return [t.type === 'transfer' ? legsOf(t).sentCurrency : nativeOf(t).currency];
        case 'month': return [day.slice(0, 7)];
        case 'week': return [weekOf(day)];
        case 'day': return [day];
        case 'weekday': return [weekdayOf(day)];
        case 'year': return [day.slice(0, 4)];
        case 'type': return [t.type];
    }
}

// Every combination of a row's keys: a row with two tags counts under each of them.
const combinations = (lists: string[][]): string[][] =>
    lists.reduce<string[][]>((acc, list) => acc.flatMap(prefix => list.map(k => [...prefix, k])), [[]]);

/** The time keys between two days, so that empty months show as zeros instead of going missing. */
function timeKeys(dim: Dimension, from: string, to: string): string[] | null {
    const keys: string[] = [];
    if (dim === 'month') for (let m = from.slice(0, 7); m <= to.slice(0, 7) && keys.length < 400; m = shiftMonthKey(m, 1)) keys.push(m);
    else if (dim === 'year') for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) keys.push(String(y));
    else if (dim === 'week' || dim === 'day') {
        const step = dim === 'week' ? 7 : 1;
        for (let d = dim === 'week' ? weekOf(from) : from; d <= to && keys.length <= 120; d = new Date(Date.parse(d) + step * 86_400_000).toISOString().slice(0, 10)) keys.push(d);
        if (keys.length > 120) return null; // too many to be worth padding
    }
    return keys;
}

const sumByCurrency = (pairs: [number | null, string | null][]) => {
    const sums = new Map<string, number>();
    for (const [amount, currency] of pairs) if (amount !== null && currency) sums.set(currency, (sums.get(currency) ?? 0) + amount);
    return [...sums.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => `${roundNative(v, c)} ${c}`).join(' + ') || null;
};

export function queryTransactions(ctx: Context, args: QueryArgs) {
    const notes: string[] = [];
    const type: OperationType = args.type ?? 'expense';
    const limit = Math.min(Math.max(1, Math.round(args.limit ?? 50)), 500);

    // ----------------------------------------------------------- the period
    let from = args.from;
    let to = args.to;
    if (args.month) {
        if (!isMonth(args.month)) throw new Error(`month must look like 2026-09, got "${args.month}".`);
        [from, to] = monthBounds(args.month);
    }
    for (const [name, day] of [['from', from], ['to', to]] as const) {
        if (day !== undefined && !isDay(day)) throw new Error(`${name} must be a date like 2026-09-30, got "${day}".`);
    }

    // ------------------------------------------------------------ the rows
    let rows = ctx.statement.transactions;
    let tripName: string | null = null;
    if (args.trip) {
        const found = findTrip(ctx.app.trips, args.trip);
        if (!found.trip) {
            if (!ctx.app.trips.length) throw new Error(ctx.app.signedIn ? 'There are no trips in the Grow Money account.' : `Trips live in the Grow Money account, which the server can't read: ${ctx.app.problem ?? 'not signed in.'}`);
            throw new Error(`No single trip matches "${args.trip}". ${found.candidates.length ? `Candidates: ${found.candidates.join('; ')}.` : `Trips: ${ctx.app.trips.map(t => t.name).join('; ')}.`}`);
        }
        tripName = found.trip.name;
        // What the trip counts, a split payment at its part: the same rows as the trip's page.
        rows = resolveTrip(found.trip, rows).counted;
        notes.push(`Only what the trip "${tripName}" counts (${found.trip.startDate} – ${found.trip.endDate}), bookings paid ahead included; a payment split between trips counts at this trip's part.`);
    }

    const lowered = (xs?: string[]) => (xs?.length ? new Set(xs.map(x => x.trim().toLowerCase()).filter(Boolean)) : null);
    const categories = lowered(args.categories);
    const groups = lowered(args.groups);
    const accounts = lowered(args.accounts);
    const tags = lowered(args.tags);
    const currencies = args.currencies?.length ? new Set(args.currencies.map(c => c.trim().toUpperCase())) : null;
    const search = args.search?.trim().toLowerCase() || null;
    const flowOnly = !!(categories || groups || args.exclude_planned || args.min_rub !== undefined || args.max_rub !== undefined);

    // Names the data doesn't have get a suggestion instead of a silent zero.
    const all = ctx.statement.transactions;
    const namesOf: Record<keyof typeof SINGULAR, () => string[]> = {
        categories: () => all.filter(t => t.type !== 'transfer').map(t => t.category),
        groups: () => all.map(groupOf),
        accounts: () => all.flatMap(t => (t.type === 'transfer' ? [t.account, t.category] : [t.account])),
        tags: () => all.flatMap(tagsOf),
    };
    for (const kind of Object.keys(SINGULAR) as (keyof typeof SINGULAR)[]) {
        if (!args[kind]?.length) continue;
        const names = namesOf[kind]();
        const known = new Set(names.map(n => (n || '').toLowerCase()));
        for (const name of args[kind]!) {
            if (known.has(name.trim().toLowerCase())) continue;
            const close = similarNames(name, names);
            notes.push(`No ${SINGULAR[kind]} is called "${name}".${close.length ? ` Close: ${close.join(', ')}.` : ' See list_categories for the names.'}`);
        }
    }

    const matched = rows.filter(t => {
        if (type !== 'all' && t.type !== type) return false;
        const isTransfer = t.type === 'transfer';
        if (isTransfer && flowOnly) return false;
        const day = dayOf(t);
        if (from && day < from) return false;
        if (to && day > to) return false;
        if (categories && !categories.has(t.category.toLowerCase())) return false;
        if (groups && !groups.has(groupOf(t).toLowerCase())) return false;
        if (args.exclude_planned && isPlannedPayment(t.category)) return false;
        if (accounts && !accounts.has((t.account || '').toLowerCase()) && !(isTransfer && accounts.has((t.category || '').toLowerCase()))) return false;
        if (currencies) {
            const legs = isTransfer ? legsOf(t) : null;
            const own = legs ? [legs.sentCurrency, legs.receivedCurrency] : [nativeOf(t).currency];
            if (!own.some(c => c && currencies.has(c))) return false;
        }
        if (tags && !tagsOf(t).some(tag => tags.has(tag.toLowerCase()))) return false;
        if (search && !`${tagsOf(t).join(' ')} ${t.note || ''}`.toLowerCase().includes(search)) return false;
        if (args.min_rub !== undefined && rubOf(t) < args.min_rub) return false;
        if (args.max_rub !== undefined && rubOf(t) > args.max_rub) return false;
        return true;
    });

    const flows = matched.filter(t => t.type !== 'transfer');
    const transfers = matched.filter(t => t.type === 'transfer');
    const days = matched.map(dayOf).sort();
    const sumRub = (xs: Transaction[]) => xs.reduce((s, t) => s + rubOf(t), 0);
    const expenses = flows.filter(t => t.type === 'expense');
    const incomes = flows.filter(t => t.type === 'income');

    const query = {
        type,
        from: from ?? null,
        to: to ?? null,
        ...(tripName ? { trip: tripName } : {}),
        ...Object.fromEntries(Object.entries({
            categories: args.categories, groups: args.groups, accounts: args.accounts, currencies: args.currencies, tags: args.tags,
        }).filter(([, v]) => v?.length)),
        ...(search ? { search: args.search } : {}),
        ...(args.min_rub !== undefined ? { min_rub: args.min_rub } : {}),
        ...(args.max_rub !== undefined ? { max_rub: args.max_rub } : {}),
        ...(args.exclude_planned ? { exclude_planned: true } : {}),
        ...(args.group_by?.length ? { group_by: args.group_by } : {}),
    };
    const totals = {
        count: matched.length,
        firstDate: days[0] ?? null,
        lastDate: days[days.length - 1] ?? null,
        ...(type === 'expense' || type === 'all' ? { expensesRub: round(sumRub(expenses)), expenseCount: expenses.length } : {}),
        ...(type === 'income' || type === 'all' ? { incomeRub: round(sumRub(incomes)), incomeCount: incomes.length } : {}),
        ...(type === 'transfer' || type === 'all' ? { transferCount: transfers.length, transferredByCurrency: sumByCurrency(transfers.map(t => { const l = legsOf(t); return [l.sent, l.sentCurrency]; })) } : {}),
    };
    if (type === 'all' && transfers.length) notes.push('Transfers move money between the user\'s own wallets: they are not in the income or expense totals.');

    // ------------------------------------------------------------- grouped
    const dims = [...new Set(args.group_by ?? [])].slice(0, 2);
    if (dims.length) {
        const mode = type === 'transfer' ? 'transfer' : type === 'all' ? 'all' : 'flow';
        const source = mode === 'all' ? flows : matched;
        if (mode === 'all' && transfers.length) notes.push('Grouped totals leave transfers out.');
        if (dims.includes('tag')) notes.push('A row with several tags counts under each of them, so the groups can add up to more than the total.');

        type Acc = { keys: string[]; rub: number; income: number; expense: number; count: number; sent: [number | null, string | null][]; received: [number | null, string | null][] };
        const accs = new Map<string, Acc>();
        const accOf = (keys: string[]) => {
            const id = keys.join('\u0000');
            let a = accs.get(id);
            if (!a) accs.set(id, (a = { keys, rub: 0, income: 0, expense: 0, count: 0, sent: [], received: [] }));
            return a;
        };
        for (const t of source) {
            for (const keys of combinations(dims.map(d => keysOf(t, d)))) {
                const a = accOf(keys);
                a.count++;
                if (t.type === 'transfer') {
                    const l = legsOf(t);
                    a.sent.push([l.sent, l.sentCurrency]);
                    a.received.push([l.received, l.receivedCurrency]);
                } else {
                    a.rub += rubOf(t);
                    if (t.type === 'income') a.income += rubOf(t); else a.expense += rubOf(t);
                }
            }
        }
        // One time dimension: every period in the range, empty ones as zeros.
        const start = from ?? days[0];
        const end = to ?? days[days.length - 1];
        if (dims.length === 1 && TIME_DIMENSIONS.has(dims[0]) && start && end) timeKeys(dims[0], start, end)?.forEach(k => accOf([k]));

        const total = mode === 'flow' ? sumRub(source) : 0;
        const time = TIME_DIMENSIONS.has(dims[0]);
        const list = [...accs.values()].sort((a, b) => {
            if (time) return a.keys[0].localeCompare(b.keys[0]) || (mode === 'transfer' ? b.count - a.count : b.rub - a.rub);
            if (dims[0] === 'weekday') return WEEKDAYS.indexOf(a.keys[0]) - WEEKDAYS.indexOf(b.keys[0]) || b.rub - a.rub;
            return mode === 'transfer' ? b.count - a.count : mode === 'all' ? b.expense - a.expense : b.rub - a.rub;
        });
        const shown = list.slice(0, limit);
        const groupsTable = mode === 'flow'
            ? table([...dims, 'rub', 'count', 'sharePct', 'avgRub'], shown.map(a => [...a.keys, round(a.rub), a.count, pct(a.rub, total), a.count ? round(a.rub / a.count) : 0]))
            : mode === 'all'
                ? table([...dims, 'incomeRub', 'expenseRub', 'netRub', 'count'], shown.map(a => [...a.keys, round(a.income), round(a.expense), round(a.income - a.expense), a.count]))
                : table([...dims, 'count', 'sent', 'received'], shown.map(a => [...a.keys, a.count, sumByCurrency(a.sent), sumByCurrency(a.received)]));
        return {
            query,
            totals,
            groups: groupsTable,
            ...(list.length > shown.length ? { omittedGroups: list.length - shown.length } : {}),
            ...(notes.length ? { notes } : {}),
        };
    }

    // ---------------------------------------------------------------- rows
    // Newest first, or the largest first; transfers have no ruble amount, so they sort after.
    const sizeOf = (t: Transaction) => (t.type === 'transfer' ? -1 : rubOf(t));
    const shown = [...matched]
        .sort((a, b) => (args.sort === 'amount' ? sizeOf(b) - sizeOf(a) : 0) || dayOf(b).localeCompare(dayOf(a)) || (a.index ?? 0) - (b.index ?? 0))
        .slice(0, limit);
    const shownFlows = shown.filter(t => t.type !== 'transfer');
    const shownTransfers = shown.filter(t => t.type === 'transfer');
    const withType = type === 'all';

    const out: Record<string, unknown> = { query, totals };
    if (type !== 'transfer') {
        out.transactions = table(
            ['date', ...(withType ? ['type'] : []), 'category', 'rub', 'amount', 'currency', 'account', 'tags', 'note'],
            shownFlows.map(t => {
                const n = nativeOf(t);
                return [dayOf(t), ...(withType ? [t.type] : []), t.category, round(rubOf(t)), n.amount, n.currency, t.account, tagsOf(t).join(', ') || null, (t.note || '').trim() || null];
            }),
        );
    }
    if (type === 'transfer' || (type === 'all' && shownTransfers.length)) {
        out.transfers = table(
            ['date', 'from', 'to', 'sent', 'sentCurrency', 'received', 'receivedCurrency', 'note'],
            shownTransfers.map(t => {
                const l = legsOf(t);
                return [dayOf(t), l.from, l.to, l.sent, l.sentCurrency, l.received, l.receivedCurrency, (t.note || '').trim() || null];
            }),
        );
    }
    const omitted = matched.length - shownFlows.length - shownTransfers.length;
    if (omitted > 0) out.omitted = `${omitted} more rows match; narrow the filters, group them, or raise limit (up to 500).`;
    if (notes.length) out.notes = notes;
    return out;
}
