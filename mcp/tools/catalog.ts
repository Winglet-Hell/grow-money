import { getGlobalCategory } from '../../src/lib/categoryGroups';
import { activeLimits } from '../../src/lib/budget';
import { tagsOf } from '../../src/lib/aiExport';
import { monthKeyFromDate, shiftMonthKey } from '../../src/lib/periods';
import type { Context } from '../context';
import { dayOf, groupOf, nativeOf, round, rubOf, table } from './common';

// The names the other tools filter by, exactly as the data spells them, with enough numbers to
// tell the important ones apart.

export function listCategories(ctx: Context) {
    const txs = ctx.statement.transactions;
    const lastMonth = shiftMonthKey(monthKeyFromDate(ctx.now), -1);
    const yearStart = shiftMonthKey(lastMonth, -11);
    const limits = activeLimits(ctx.app.limits, txs);

    type Acc = { count: number; rub: number; year: number; first: string; last: string };
    const add = (map: Map<string, Acc>, key: string, rub: number, day: string) => {
        const a = map.get(key) ?? { count: 0, rub: 0, year: 0, first: day, last: day };
        a.count++;
        a.rub += rub;
        if (day.slice(0, 7) >= yearStart && day.slice(0, 7) <= lastMonth) a.year += rub;
        if (day < a.first) a.first = day;
        if (day > a.last) a.last = day;
        map.set(key, a);
    };

    const expense = new Map<string, Acc>();
    const income = new Map<string, Acc>();
    const tags = new Map<string, Acc>();
    const currencies = new Map<string, Acc>();
    for (const t of txs) {
        if (t.type === 'transfer') continue;
        const day = dayOf(t);
        add(t.type === 'expense' ? expense : income, t.category || 'Uncategorized', rubOf(t), day);
        if (t.type !== 'expense') continue;
        for (const tag of tagsOf(t)) add(tags, tag, rubOf(t), day);
        add(currencies, nativeOf(t).currency, rubOf(t), day);
    }
    const byRub = (a: [string, Acc], b: [string, Acc]) => b[1].rub - a[1].rub;

    const groups: Record<string, string[]> = {};
    for (const [category] of [...expense.entries()].sort(byRub)) (groups[getGlobalCategory(category)] ??= []).push(category);

    return {
        note: `Exact names to pass to query_transactions (matching ignores case). Amounts in RUB; avgMonthRub is over the 12 complete months ${yearStart} – ${lastMonth}. limitRub is the user's monthly budget for the category.`,
        expenseCategories: table(
            ['category', 'group', 'count', 'totalRub', 'avgMonthRub', 'limitRub', 'firstDate', 'lastDate'],
            [...expense.entries()].sort(byRub).map(([c, a]) => [c, getGlobalCategory(c), a.count, round(a.rub), round(a.year / 12), limits[c] ?? null, a.first, a.last]),
        ),
        incomeCategories: table(
            ['category', 'count', 'totalRub', 'avgMonthRub', 'firstDate', 'lastDate'],
            [...income.entries()].sort(byRub).map(([c, a]) => [c, a.count, round(a.rub), round(a.year / 12), a.first, a.last]),
        ),
        categoryGroups: groups,
        accounts: table(
            ['account', 'currency', 'operations', 'lastUsed', 'archived'],
            ctx.accounts
                .filter(a => a.txCount > 0 || a.current !== 0)
                .sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? '') || a.name.localeCompare(b.name))
                .map(a => [a.name, a.currency, a.txCount, a.lastActivity, a.archived]),
        ),
        tags: {
            note: 'Tags name the merchant or place; the most used 80 expense tags.',
            ...table(['tag', 'count', 'expenseRub', 'lastDate'], [...tags.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 80).map(([tag, a]) => [tag, a.count, round(a.rub), a.last])),
            more: Math.max(0, tags.size - 80),
        },
        spendingCurrencies: table(['currency', 'expenses', 'expenseRub', 'lastDate'], [...currencies.entries()].sort(byRub).map(([c, a]) => [c, a.count, round(a.rub), a.last])),
        trips: table(['trip', 'startDate', 'endDate'], ctx.app.trips.map(t => [t.name, t.startDate, t.endDate])),
        groupNames: [...new Set(txs.map(groupOf))],
    };
}
