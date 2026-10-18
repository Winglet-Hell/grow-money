import type { AIExportPayload } from '../../src/lib/aiExport';
import { analystPayload, exchangeRates, type Context } from '../context';
import { formatJson } from '../format';

// The app's AI Analyst Export, section by section: the same precomputed figures, with the notes
// that say how to read them. The raw ledgers stay out (query_transactions serves rows), and the
// longest lists are cut so one answer stays readable.

export const SECTIONS = [
    'summary', 'monthly', 'current_month', 'expenses', 'payees', 'recurring', 'budget', 'income', 'fx', 'accounts', 'trips',
    'milestones', 'data_quality', 'profile',
] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_HELP: Record<Section, string> = {
    summary: 'all-time totals, savings rate, net worth',
    monthly: 'every month: income, expenses, net, savings rate; 3/6-month and all-time averages',
    current_month: 'the running month to date, against the previous month on the same day, with a month-end projection',
    expenses: 'by category, group, currency, wallet and weekday; month × category matrix; trends; the 30 largest',
    payees: 'spending by merchant (the tag)',
    recurring: 'the Recurring page\'s list of subscriptions and bills (active / missed / ended), and habits by cadence',
    budget: 'monthly category limits against this month and the track record',
    income: 'by source and month; paycheck jobs and planned salary',
    fx: 'currency exchanges: rates actually paid, the cut exchangers took against the market rate of the day, by pair and route',
    accounts: 'wallet balances in rubles, net worth by currency, volatile assets',
    trips: 'every trip with its total, per day, budget and top categories',
    milestones: 'life events and the chapters between them, per average month',
    data_quality: 'what limits the analysis: untagged rows, odd conversions, months with no records',
    profile: 'who the user is: residence, travel, work, currencies, jobs',
};

const LIMITS = { payees: 100, conversions: 40, rateSeries: 24 };
// What one answer may carry. MCP clients cap a tool's answer (Claude Code at 25k tokens), so the
// sections past this are named for a second call instead of being cut off mid-way.
const MAX_ANSWER_CHARS = 48_000;

function cut<T>(rows: T[], max: number) {
    return rows.length > max ? { rows: rows.slice(0, max), omitted: rows.length - max } : { rows };
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Lists of like objects as one header and rows of values: the export repeats every key on every
 * row, which is most of its size. A list under "rows" moves its columns up next to it.
 */
export function tabulate(value: unknown): unknown {
    if (Array.isArray(value)) {
        const items = value.map(tabulate);
        if (items.length >= 3 && items.every(isRecord)) {
            const columns = [...new Set(items.flatMap(o => Object.keys(o)))];
            const filled = items.reduce((n, o) => n + Object.keys(o).length, 0);
            if (filled >= columns.length * items.length * 0.8) return { columns, rows: items.map(o => columns.map(c => o[c] ?? null)) };
        }
        return items;
    }
    if (!isRecord(value)) return value;
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
        const t = tabulate(v);
        if (key === 'rows' && isRecord(t) && Array.isArray(t.columns) && !('columns' in value)) Object.assign(out, t);
        else out[key] = t;
    }
    return out;
}

/** { month: { name: amount } } as a table: a column per name (largest overall first), a row per month. */
function matrix(byMonth: Record<string, Record<string, number>>, first: string) {
    const totals = new Map<string, number>();
    for (const row of Object.values(byMonth)) for (const [k, v] of Object.entries(row)) totals.set(k, (totals.get(k) ?? 0) + v);
    const names = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return { columns: [first, ...names], rows: Object.entries(byMonth).map(([month, row]) => [month, ...names.map(n => row[n] ?? 0)]) };
}

function section(p: AIExportPayload, name: Section): unknown {
    switch (name) {
        case 'summary': return p.summary;
        case 'monthly': return p.monthly;
        case 'current_month': return p.currentMonth;
        case 'expenses': return {
            ...p.expenses,
            monthlyByCategory: matrix(p.expenses.monthlyByCategory, 'month'),
            monthlyByCurrency: { note: 'Spending per month by the currency it was paid in, valued in RUB.', ...matrix(p.expenses.monthlyByCurrency, 'month') },
        };
        case 'payees': {
            const { rows, omitted } = cut(p.payees.rows, LIMITS.payees);
            return { ...p.payees, rows, ...(omitted ? { omittedRows: `${omitted} smaller payees left out; query_transactions with group_by ["payee"] lists them all` } : {}) };
        }
        case 'recurring': return p.recurring;
        case 'budget': return p.budget;
        case 'income': {
            const { jobs, plannedMonthlySalary, plannedSalaryNote } = p.profile;
            return { ...p.income, monthlyBySource: matrix(p.income.monthlyBySource, 'month'), jobs, plannedMonthlySalary, plannedSalaryNote };
        }
        case 'fx': {
            const { rows, omitted } = cut(p.fx.conversions, LIMITS.conversions);
            return {
                ...p.fx,
                pairs: p.fx.pairs.map(pair => (pair.rateSeries.length > LIMITS.rateSeries
                    ? { ...pair, rateSeries: pair.rateSeries.slice(-LIMITS.rateSeries), rateSeriesNote: `the last ${LIMITS.rateSeries} of ${pair.rateSeries.length} rates, oldest first` }
                    : pair)),
                conversions: rows,
                ...(omitted ? { olderConversions: `${omitted} older conversions left out; query_transactions with type "transfer" lists them` } : {}),
            };
        }
        case 'accounts': return p.accounts;
        case 'trips': return p.trips;
        case 'milestones': return p.milestones;
        case 'data_quality': return p.dataQuality;
        case 'profile': return p.profile;
    }
}

export async function getAnalytics(ctx: Context, sections: Section[]) {
    const wanted = [...new Set(sections.length ? sections : (['summary', 'current_month', 'monthly'] as Section[]))];
    // Only the exchange benchmark needs the market rate of every conversion day.
    const reference = wanted.some(s => s === 'fx' || s === 'data_quality') ? await exchangeRates(ctx) : undefined;
    const p = analystPayload(ctx, reference);
    const out: Record<string, unknown> = {
        meta: {
            baseCurrency: p.meta.baseCurrency,
            readMeFirst: [
                ...p.meta.readMeFirst.filter(line => !/ledger at the end/i.test(line)),
                'Lists of records come as columns + rows: rows[i][j] is the value of columns[j].',
            ],
            coverage: p.meta.coverage,
            completeness: p.meta.completeness,
            ...(reference?.isLoading ? { ratesStillLoading: 'Market rates for some exchange days are still downloading; ask again in a minute for the complete fx figures.' } : {}),
        },
    };
    let size = formatJson(out).length;
    const later: Section[] = [];
    for (const name of wanted) {
        const body = tabulate(section(p, name));
        const length = formatJson(body, 2).length;
        // The first section always goes out; later ones only while the answer stays readable.
        if (later.length || (size + length > MAX_ANSWER_CHARS && Object.keys(out).length > 1)) {
            later.push(name);
            continue;
        }
        out[name] = body;
        size += length;
    }
    if (later.length) out.notIncluded = { sections: later, note: 'Left out to keep this answer within the client\'s size limit: ask get_analytics for these in another call.' };
    return out;
}
