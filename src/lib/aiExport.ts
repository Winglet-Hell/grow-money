// Builds the payload handed to an external LLM ("AI Analyst Export").
//
// Guiding principle: the model must never have to *guess* what a number means.
// Every amount is labelled with its currency, every aggregate says what it covers,
// and anything the model could reasonably misread (partial months, manually kept
// balances, transfer legs that are NOT in the base currency) is flagged explicitly.
import type { Transaction, Trip, PaycheckConfig } from '../types';
import { getGlobalCategory } from './categoryGroups';
import { resolveTripActiveTransactions } from './tripUtils';

// ---------------------------------------------------------------------------
// small numeric helpers
// ---------------------------------------------------------------------------

const round = (n: number, d = 2): number => {
    if (!isFinite(n)) return 0;
    const f = 10 ** d;
    return Math.round(n * f) / f;
};

const sum = (xs: number[]): number => xs.reduce((s, x) => s + x, 0);
const mean = (xs: number[]): number => (xs.length ? sum(xs) / xs.length : 0);

const median = (xs: number[]): number => {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// Coefficient of variation, in % — how stable a repeating charge is.
const variationPct = (xs: number[]): number => {
    const m = mean(xs);
    if (!m) return 0;
    const sd = Math.sqrt(mean(xs.map(x => (x - m) ** 2)));
    return (sd / Math.abs(m)) * 100;
};

const MS_DAY = 86400000;
const dayDiff = (from: string, to: string): number =>
    Math.round((Date.parse(to) - Date.parse(from)) / MS_DAY);

const monthKey = (isoDate: string): string => isoDate.slice(0, 7);

const daysInMonth = (mk: string): number => {
    const [y, m] = mk.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

// Calendar months covered by a date range, inclusive of both ends.
const monthsSpanned = (first: string, last: string): number => {
    const [ay, am] = monthKey(first).split('-').map(Number);
    const [by, bm] = monthKey(last).split('-').map(Number);
    return Math.max(1, (by - ay) * 12 + (bm - am) + 1);
};

const addMonths = (mk: string, delta: number): string => {
    const [y, m] = mk.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekdayOf = (isoDate: string): string => WEEKDAYS[new Date(`${isoDate}T00:00:00Z`).getUTCDay()] ?? 'Unknown';

const share = (part: number, total: number): number => (total ? round((part / total) * 100, 2) : 0);

// ---------------------------------------------------------------------------
// transaction helpers
// ---------------------------------------------------------------------------

const tagsOf = (t: Transaction): string[] => {
    if (Array.isArray(t.tags)) return t.tags.map(x => String(x).trim()).filter(Boolean);
    if (t.tags) return [String(t.tags).trim()].filter(Boolean);
    return [];
};

// The label that identifies *where* the money went. Tags are filled on nearly every
// row in this dataset; notes are the rare fallback.
const payeeOf = (t: Transaction): string | null => {
    const tag = tagsOf(t)[0];
    if (tag) return tag;
    const note = (t.note || '').trim();
    return note.length >= 2 ? note : null;
};

// Expense/income rows carry `amount` already converted to the accounting currency
// ("Сумма в валюте учета"). Transfers do NOT — they are handled separately.
const baseAmount = (t: Transaction): number => Math.abs(t.amount);

const nativeCurrencyOf = (t: Transaction, baseCurrency: string): string =>
    (t.originalCurrency || t.currency || baseCurrency).toUpperCase();

const nativeAmountOf = (t: Transaction): number =>
    Math.abs(t.originalAmount !== undefined ? t.originalAmount : t.amount);

// ---------------------------------------------------------------------------
// inputs
// ---------------------------------------------------------------------------

export interface ExportAccount {
    name: string;
    type: string;
    currency: string;
    balance: number;         // manually maintained, in the account's own currency
    rubEquivalent: number;
    balanceDate?: string;
}

export interface ExportRates {
    rates: Record<string, number>; // base-currency units per 1 unit of CODE
    date: string | null;
    isLive: boolean;
}

export interface AIExportInput {
    transactions: Transaction[];
    accounts?: ExportAccount[];
    netWorth?: number;
    liveRates?: ExportRates;
    trips?: Trip[];
    paycheck?: PaycheckConfig;
}

// ---------------------------------------------------------------------------
// payload
// ---------------------------------------------------------------------------

export function buildAIExportPayload(input: AIExportInput) {
    const { transactions, accounts = [], netWorth, liveRates, trips = [], paycheck } = input;

    const expenses = transactions.filter(t => t.type === 'expense');
    const incomes = transactions.filter(t => t.type === 'income');
    const transfers = transactions.filter(t => t.type === 'transfer');
    const flows = [...expenses, ...incomes]; // the rows that are denominated in the base currency

    // Base currency = whatever "валюта учета" actually says, not an assumption.
    const currencyVotes = new Map<string, number>();
    flows.forEach(t => {
        const c = (t.currency || '').toUpperCase();
        if (c) currencyVotes.set(c, (currencyVotes.get(c) || 0) + 1);
    });
    const baseCurrency =
        [...currencyVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'RUB';
    const offBaseRows = flows.filter(
        t => t.currency && t.currency.toUpperCase() !== baseCurrency
    ).length;

    const allDates = transactions.map(t => t.date).filter(Boolean).sort();
    const firstDate = allDates[0] ?? null;
    const lastDate = allDates[allDates.length - 1] ?? null;

    // Every month between the first and last record, so gaps are visible as zeros
    // rather than silently missing keys.
    const monthKeys: string[] = [];
    if (firstDate && lastDate) {
        let mk = monthKey(firstDate);
        const end = monthKey(lastDate);
        while (mk <= end) {
            monthKeys.push(mk);
            mk = addMonths(mk, 1);
        }
    }

    // A month is only usable for averages/forecasts if the data actually spans it.
    const lastMonth = lastDate ? monthKey(lastDate) : null;
    const lastMonthDaysCovered = lastDate ? Number(lastDate.slice(8, 10)) : 0;
    const lastMonthTotalDays = lastMonth ? daysInMonth(lastMonth) : 0;
    const lastMonthIsPartial = !!lastMonth && lastMonthDaysCovered < lastMonthTotalDays;
    const completeMonths = lastMonthIsPartial ? monthKeys.slice(0, -1) : monthKeys;

    const totalExpense = sum(expenses.map(baseAmount));
    const totalIncome = sum(incomes.map(baseAmount));

    // ---------------------------------------------------------------- monthly
    const monthAgg = new Map<
        string,
        { income: number; expenses: number; incomeCount: number; expenseCount: number; transferCount: number }
    >();
    monthKeys.forEach(mk =>
        monthAgg.set(mk, { income: 0, expenses: 0, incomeCount: 0, expenseCount: 0, transferCount: 0 })
    );
    const bucket = (mk: string) => {
        let b = monthAgg.get(mk);
        if (!b) {
            b = { income: 0, expenses: 0, incomeCount: 0, expenseCount: 0, transferCount: 0 };
            monthAgg.set(mk, b);
        }
        return b;
    };
    expenses.forEach(t => {
        const b = bucket(monthKey(t.date));
        b.expenses += baseAmount(t);
        b.expenseCount += 1;
    });
    incomes.forEach(t => {
        const b = bucket(monthKey(t.date));
        b.income += baseAmount(t);
        b.incomeCount += 1;
    });
    transfers.forEach(t => {
        bucket(monthKey(t.date)).transferCount += 1;
    });

    const monthly = monthKeys.map(mk => {
        const b = bucket(mk);
        const isPartial = mk === lastMonth && lastMonthIsPartial;
        const daysCovered = isPartial ? lastMonthDaysCovered : daysInMonth(mk);
        const net = b.income - b.expenses;
        return {
            month: mk,
            income: round(b.income),
            expenses: round(b.expenses),
            net: round(net),
            savingsRatePct: b.income > 0 ? round((net / b.income) * 100) : null,
            avgDailySpend: daysCovered ? round(b.expenses / daysCovered) : 0,
            expenseCount: b.expenseCount,
            incomeCount: b.incomeCount,
            transferCount: b.transferCount,
            daysCovered,
            daysInMonth: daysInMonth(mk),
            isPartial,
        };
    });

    const completeMonthly = monthly.filter(m => !m.isPartial && (m.expenseCount > 0 || m.incomeCount > 0));
    const last3 = completeMonthly.slice(-3);
    const last6 = completeMonthly.slice(-6);
    const avgOf = (rows: typeof completeMonthly, pick: (m: (typeof completeMonthly)[number]) => number) =>
        rows.length ? round(mean(rows.map(pick))) : 0;

    const averages = {
        note: 'Partial (incomplete) months are excluded from every average below.',
        monthsUsed: completeMonthly.length,
        allTime: {
            income: avgOf(completeMonthly, m => m.income),
            expenses: avgOf(completeMonthly, m => m.expenses),
            net: avgOf(completeMonthly, m => m.net),
        },
        last6Months: {
            monthsUsed: last6.length,
            income: avgOf(last6, m => m.income),
            expenses: avgOf(last6, m => m.expenses),
            net: avgOf(last6, m => m.net),
            savingsRatePct: last6.length && sum(last6.map(m => m.income)) > 0
                ? round((sum(last6.map(m => m.net)) / sum(last6.map(m => m.income))) * 100)
                : null,
        },
        last3Months: {
            monthsUsed: last3.length,
            income: avgOf(last3, m => m.income),
            expenses: avgOf(last3, m => m.expenses),
            net: avgOf(last3, m => m.net),
            savingsRatePct: last3.length && sum(last3.map(m => m.income)) > 0
                ? round((sum(last3.map(m => m.net)) / sum(last3.map(m => m.income))) * 100)
                : null,
        },
    };

    // ------------------------------------------------------- expense breakdown
    interface CatAcc {
        amount: number;
        count: number;
        tickets: number[];
        months: Set<string>;
        first: string;
        last: string;
    }
    const catMap = new Map<string, CatAcc>();
    expenses.forEach(t => {
        const key = t.category || 'Uncategorized';
        const amt = baseAmount(t);
        let a = catMap.get(key);
        if (!a) {
            a = { amount: 0, count: 0, tickets: [], months: new Set(), first: t.date, last: t.date };
            catMap.set(key, a);
        }
        a.amount += amt;
        a.count += 1;
        a.tickets.push(amt);
        a.months.add(monthKey(t.date));
        if (t.date < a.first) a.first = t.date;
        if (t.date > a.last) a.last = t.date;
    });

    const byCategory = [...catMap.entries()]
        .map(([category, a]) => ({
            category,
            group: getGlobalCategory(category),
            amount: round(a.amount),
            count: a.count,
            sharePct: share(a.amount, totalExpense),
            avgTicket: round(a.amount / a.count),
            medianTicket: round(median(a.tickets)),
            maxTicket: round(Math.max(...a.tickets)),
            activeMonths: a.months.size,
            avgPerActiveMonth: round(a.amount / a.months.size),
            firstDate: a.first,
            lastDate: a.last,
        }))
        .sort((x, y) => y.amount - x.amount);

    const groupMap = new Map<string, { amount: number; count: number }>();
    byCategory.forEach(c => {
        const g = groupMap.get(c.group) || { amount: 0, count: 0 };
        g.amount += c.amount;
        g.count += c.count;
        groupMap.set(c.group, g);
    });
    const byGroup = [...groupMap.entries()]
        .map(([group, g]) => ({
            group,
            amount: round(g.amount),
            count: g.count,
            sharePct: share(g.amount, totalExpense),
        }))
        .sort((x, y) => y.amount - x.amount);

    // month × category matrix — the raw material for trends and forecasting.
    const monthlyByCategory: Record<string, Record<string, number>> = {};
    monthKeys.forEach(mk => (monthlyByCategory[mk] = {}));
    expenses.forEach(t => {
        const mk = monthKey(t.date);
        const key = t.category || 'Uncategorized';
        monthlyByCategory[mk] = monthlyByCategory[mk] || {};
        monthlyByCategory[mk][key] = round((monthlyByCategory[mk][key] || 0) + baseAmount(t));
    });

    // Trend: last complete month vs the average of the three before it.
    const trendMonths = completeMonthly.map(m => m.month);
    const categoryTrends = byCategory
        .filter(c => c.count >= 3 && trendMonths.length >= 4)
        .map(c => {
            const series = trendMonths.map(mk => monthlyByCategory[mk]?.[c.category] || 0);
            const latest = series[series.length - 1];
            const prior = mean(series.slice(-4, -1));
            return {
                category: c.category,
                monthlySeries: series.map(v => round(v)),
                latestMonth: round(latest),
                priorAvg3: round(prior),
                changePct: prior > 0 ? round(((latest - prior) / prior) * 100) : null,
            };
        })
        .filter(c => c.changePct !== null)
        .sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0))
        .slice(0, 20);

    // ------------------------------------------------------ currency exposure
    const curMap = new Map<string, { base: number; native: number; count: number }>();
    expenses.forEach(t => {
        const c = nativeCurrencyOf(t, baseCurrency);
        const a = curMap.get(c) || { base: 0, native: 0, count: 0 };
        a.base += baseAmount(t);
        a.native += nativeAmountOf(t);
        a.count += 1;
        curMap.set(c, a);
    });
    const spendByCurrency = [...curMap.entries()]
        .map(([currency, a]) => ({
            currency,
            amountInBase: round(a.base),
            amountNative: round(a.native),
            count: a.count,
            sharePct: share(a.base, totalExpense),
        }))
        .sort((x, y) => y.amountInBase - x.amountInBase);

    const monthlyByCurrency: Record<string, Record<string, number>> = {};
    monthKeys.forEach(mk => (monthlyByCurrency[mk] = {}));
    expenses.forEach(t => {
        const mk = monthKey(t.date);
        const c = nativeCurrencyOf(t, baseCurrency);
        monthlyByCurrency[mk] = monthlyByCurrency[mk] || {};
        monthlyByCurrency[mk][c] = round((monthlyByCurrency[mk][c] || 0) + baseAmount(t));
    });

    // ------------------------------------------------------------- by account
    const acctMap = new Map<string, { amount: number; count: number; currencies: Set<string>; last: string }>();
    expenses.forEach(t => {
        const key = t.account || 'Unknown';
        const a = acctMap.get(key) || { amount: 0, count: 0, currencies: new Set<string>(), last: t.date };
        a.amount += baseAmount(t);
        a.count += 1;
        a.currencies.add(nativeCurrencyOf(t, baseCurrency));
        if (t.date > a.last) a.last = t.date;
        acctMap.set(key, a);
    });
    const spendByAccount = [...acctMap.entries()]
        .map(([account, a]) => ({
            account,
            currencies: [...a.currencies],
            amount: round(a.amount),
            count: a.count,
            sharePct: share(a.amount, totalExpense),
            lastUsed: a.last,
        }))
        .sort((x, y) => y.amount - x.amount);

    // ------------------------------------------------------------- by weekday
    const wdMap = new Map<string, { amount: number; count: number }>();
    expenses.forEach(t => {
        const w = weekdayOf(t.date);
        const a = wdMap.get(w) || { amount: 0, count: 0 };
        a.amount += baseAmount(t);
        a.count += 1;
        wdMap.set(w, a);
    });
    const byWeekday = WEEKDAYS.map(w => {
        const a = wdMap.get(w) || { amount: 0, count: 0 };
        return { weekday: w, amount: round(a.amount), count: a.count, sharePct: share(a.amount, totalExpense) };
    });

    // ------------------------------------------------------- payees (tags)
    interface PayeeAcc {
        name: string;
        amount: number;
        count: number;
        tickets: number[];
        months: Set<string>;
        cats: Map<string, number>;
        dates: string[];
    }
    const payeeMap = new Map<string, PayeeAcc>();
    let untaggedExpenses = 0;
    let multiTagRows = 0;
    expenses.forEach(t => {
        if (tagsOf(t).length > 1) multiTagRows += 1;
        const name = payeeOf(t);
        if (!name) {
            untaggedExpenses += 1;
            return;
        }
        const key = name.toLowerCase();
        let a = payeeMap.get(key);
        if (!a) {
            a = { name, amount: 0, count: 0, tickets: [], months: new Set(), cats: new Map(), dates: [] };
            payeeMap.set(key, a);
        }
        const amt = baseAmount(t);
        a.amount += amt;
        a.count += 1;
        a.tickets.push(amt);
        a.months.add(monthKey(t.date));
        a.cats.set(t.category, (a.cats.get(t.category) || 0) + 1);
        a.dates.push(t.date);
    });

    const payeesAll = [...payeeMap.values()].sort((a, b) => b.amount - a.amount);
    const payeesKept = payeesAll.filter(p => p.count >= 2);
    const payeesTail = payeesAll.filter(p => p.count < 2);
    const untaggedAmount = sum(expenses.filter(t => !payeeOf(t)).map(baseAmount));

    const payees = payeesKept.map(p => ({
        name: p.name,
        mainCategory: [...p.cats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Uncategorized',
        amount: round(p.amount),
        count: p.count,
        sharePct: share(p.amount, totalExpense),
        avgTicket: round(p.amount / p.count),
        medianTicket: round(median(p.tickets)),
        activeMonths: p.months.size,
        avgPerActiveMonth: round(p.amount / p.months.size),
        firstDate: p.dates.reduce((a, b) => (a < b ? a : b)),
        lastDate: p.dates.reduce((a, b) => (a > b ? a : b)),
    }));

    // ----------------------------------------------------------- recurring
    const asOf = lastDate ?? new Date().toISOString().slice(0, 10);
    const classifyCadence = (gap: number): string => {
        if (gap >= 5 && gap <= 9) return 'weekly';
        if (gap >= 10 && gap <= 18) return 'biweekly';
        if (gap >= 25 && gap <= 35) return 'monthly';
        if (gap >= 55 && gap <= 70) return 'bimonthly';
        if (gap >= 80 && gap <= 100) return 'quarterly';
        if (gap >= 170 && gap <= 200) return 'semiannual';
        if (gap >= 340 && gap <= 400) return 'annual';
        if (gap < 5) return 'near-daily';
        return 'irregular';
    };

    const REGULAR_CADENCES = ['weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual'];

    const recurring = payeesAll
        .filter(p => p.count >= 3 && p.months.size >= 3)
        .map(p => {
            const dates = [...p.dates].sort();
            const gaps: number[] = [];
            for (let i = 1; i < dates.length; i++) gaps.push(dayDiff(dates[i - 1], dates[i]));
            const medGap = median(gaps);
            const gapVar = gaps.length > 1 ? variationPct(gaps) : 0;
            const cadence = classifyCadence(medGap);
            const medAmount = median(p.tickets);
            const span = monthsSpanned(dates[0], dates[dates.length - 1]);

            // Extrapolating "median charge × times per month" is only honest for a genuinely
            // regular schedule. Clustered bursts (16 kebab orders across a few days) would
            // otherwise project a monthly cost larger than everything ever paid — so those
            // fall back to the observed run-rate over the period the charge was alive.
            const useCadence = REGULAR_CADENCES.includes(cadence) && medGap > 0 && gapVar < 40;
            const monthlyCost = useCadence ? medAmount * (30.44 / medGap) : p.amount / span;
            const sinceLast = dayDiff(dates[dates.length - 1], asOf);

            // "Has this stopped?" is judged against the AVERAGE gap, not the median: a
            // habit that clusters (several orders in one evening) has a median gap of ~0
            // days, which would flag it as lapsed after a normal quiet week.
            const avgGap = gaps.length ? dayDiff(dates[0], dates[dates.length - 1]) / gaps.length : 0;
            const staleAfter = Math.max(avgGap * 2.5, 10);

            return {
                name: p.name,
                category: [...p.cats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Uncategorized',
                occurrences: p.count,
                monthsSeen: p.months.size,
                monthsSpanned: span,
                cadence,
                medianGapDays: round(medGap, 1),
                avgGapDays: round(avgGap, 1),
                gapVariationPct: round(gapVar, 1),
                medianAmount: round(medAmount),
                amountVariationPct: round(variationPct(p.tickets), 1),
                estimatedMonthlyCost: round(monthlyCost),
                estimateMethod: useCadence ? 'cadence' : 'run-rate',
                totalPaid: round(p.amount),
                firstDate: dates[0],
                lastDate: dates[dates.length - 1],
                daysSinceLast: sinceLast,
                status: sinceLast > staleAfter ? 'lapsed' : 'active',
            };
        })
        .sort((a, b) => b.estimatedMonthlyCost - a.estimatedMonthlyCost)
        .slice(0, 60);

    // Anything the source data itself labels a subscription, whatever its cadence.
    const subscriptionTxs = expenses.filter(t => /subscription|подпис/i.test(t.category));
    const subsMap = new Map<
        string,
        { name: string; amount: number; count: number; months: Set<string>; dates: string[]; tickets: number[] }
    >();
    subscriptionTxs.forEach(t => {
        const name = payeeOf(t) || 'Unnamed subscription';
        const key = name.toLowerCase();
        const a = subsMap.get(key) || { name, amount: 0, count: 0, months: new Set<string>(), dates: [], tickets: [] };
        a.amount += baseAmount(t);
        a.count += 1;
        a.months.add(monthKey(t.date));
        a.dates.push(t.date);
        a.tickets.push(baseAmount(t));
        subsMap.set(key, a);
    });
    const subscriptions = [...subsMap.values()]
        .map(s => {
            const dates = [...s.dates].sort();
            const last = dates[dates.length - 1];
            const gaps: number[] = [];
            for (let i = 1; i < dates.length; i++) gaps.push(dayDiff(dates[i - 1], dates[i]));
            const medGap = gaps.length ? median(gaps) : 0;
            const sinceLast = dayDiff(last, asOf);
            // A single-charge subscription has no observable cadence; assume monthly billing.
            const staleAfter = medGap > 0 ? medGap * 2.5 : 60;
            const span = monthsSpanned(dates[0], last);
            return {
                name: s.name,
                totalPaid: round(s.amount),
                charges: s.count,
                monthsSeen: s.months.size,
                monthsSpanned: span,
                medianCharge: round(median(s.tickets)),
                medianGapDays: gaps.length ? round(medGap, 1) : null,
                runRatePerMonth: round(s.amount / span),
                firstCharge: dates[0],
                lastCharge: last,
                daysSinceLastCharge: sinceLast,
                status: sinceLast > staleAfter ? 'lapsed' : 'active',
            };
        })
        .sort((a, b) => b.totalPaid - a.totalPaid);

    // ---------------------------------------------------------------- income
    interface IncAcc {
        amount: number;
        count: number;
        amounts: number[];
        months: Set<string>;
        dates: string[];
    }
    const incMap = new Map<string, IncAcc>();
    incomes.forEach(t => {
        const key = t.category || 'Uncategorized';
        const a = incMap.get(key) || { amount: 0, count: 0, amounts: [], months: new Set<string>(), dates: [] };
        a.amount += baseAmount(t);
        a.count += 1;
        a.amounts.push(baseAmount(t));
        a.months.add(monthKey(t.date));
        a.dates.push(t.date);
        incMap.set(key, a);
    });
    const incomeBySource = [...incMap.entries()]
        .map(([source, a]) => {
            const dates = [...a.dates].sort();
            const gaps: number[] = [];
            for (let i = 1; i < dates.length; i++) gaps.push(dayDiff(dates[i - 1], dates[i]));
            return {
                source,
                amount: round(a.amount),
                count: a.count,
                sharePct: share(a.amount, totalIncome),
                avgPayment: round(a.amount / a.count),
                medianPayment: round(median(a.amounts)),
                variationPct: round(variationPct(a.amounts), 1),
                activeMonths: a.months.size,
                avgPerActiveMonth: round(a.amount / a.months.size),
                medianGapDays: gaps.length ? round(median(gaps), 1) : null,
                firstDate: dates[0],
                lastDate: dates[dates.length - 1],
                daysSinceLast: dayDiff(dates[dates.length - 1], asOf),
            };
        })
        .sort((a, b) => b.amount - a.amount);

    const monthlyByIncomeSource: Record<string, Record<string, number>> = {};
    monthKeys.forEach(mk => (monthlyByIncomeSource[mk] = {}));
    incomes.forEach(t => {
        const mk = monthKey(t.date);
        const key = t.category || 'Uncategorized';
        monthlyByIncomeSource[mk] = monthlyByIncomeSource[mk] || {};
        monthlyByIncomeSource[mk][key] = round((monthlyByIncomeSource[mk][key] || 0) + baseAmount(t));
    });

    // Concentration: how much of the income rests on a single stream.
    const topSourceShare = incomeBySource[0]?.sharePct ?? 0;

    // -------------------------------------------------------------------- FX
    // Cross-currency transfers are the only place where a real, personally-paid
    // exchange rate is observable. Each leg keeps its own currency.
    const crossTransfers = transfers.filter(
        t =>
            t.fromCurrency &&
            t.toCurrency &&
            t.fromCurrency !== t.toCurrency &&
            (t.fromAmount ?? 0) > 0 &&
            (t.toAmount ?? 0) > 0
    );
    const internalTransfers = transfers.filter(t => !crossTransfers.includes(t));
    const transfersMissingLegData = transfers.filter(t => !t.fromCurrency && !t.toCurrency).length;

    const pairGroups = new Map<string, Transaction[]>();
    crossTransfers.forEach(t => {
        const [a, b] = [t.fromCurrency!, t.toCurrency!].sort();
        const key = `${a}|${b}`;
        pairGroups.set(key, [...(pairGroups.get(key) || []), t]);
    });

    const fxPairs = [...pairGroups.entries()]
        .map(([key, list]) => {
            const [a, b] = key.split('|');
            // Quote the pair so the headline rate reads >= 1 (e.g. "1 USDT = 78 RUB").
            const bPerA = list.map(t =>
                t.fromCurrency === a ? t.toAmount! / t.fromAmount! : t.fromAmount! / t.toAmount!
            );
            const [base, quote] = mean(bPerA) >= 1 ? [a, b] : [b, a];
            const rateOf = (t: Transaction) =>
                t.fromCurrency === base ? t.toAmount! / t.fromAmount! : t.fromAmount! / t.toAmount!;

            const sorted = [...list].sort((x, y) =>
                x.date !== y.date ? x.date.localeCompare(y.date) : (x.index ?? 0) - (y.index ?? 0)
            );
            const rates = sorted.map(rateOf);

            let baseVolume = 0;
            let quoteVolume = 0;
            list.forEach(t => {
                if (t.fromCurrency === base) {
                    baseVolume += t.fromAmount!;
                    quoteVolume += t.toAmount!;
                } else {
                    baseVolume += t.toAmount!;
                    quoteVolume += t.fromAmount!;
                }
            });

            // Which way the money actually flows (what is spent -> what is received).
            const forward = list.filter(t => t.fromCurrency === a).length;
            const backward = list.length - forward;
            const [from, to] =
                forward > backward ? [a, b] : backward > forward ? [b, a] : [quote, base];

            const minRate = Math.min(...rates);
            const maxRate = Math.max(...rates);
            const weighted = baseVolume > 0 ? quoteVolume / baseVolume : mean(rates);
            const live =
                liveRates?.rates?.[base] && liveRates?.rates?.[quote]
                    ? liveRates.rates[base] / liveRates.rates[quote]
                    : null;

            return {
                pair: `${base}/${quote}`,
                rateMeaning: `1 ${base} = X ${quote}`,
                spends: from,
                receives: to,
                count: list.length,
                avgRate: round(mean(rates), 6),
                weightedAvgRate: round(weighted, 6),
                minRate: round(minRate, 6),
                maxRate: round(maxRate, 6),
                spreadPct: minRate > 0 ? round(((maxRate - minRate) / minRate) * 100, 2) : 0,
                lastRate: round(rates[rates.length - 1], 6),
                lastDate: sorted[sorted.length - 1].date,
                firstDate: sorted[0].date,
                volumeSpent: round(from === base ? baseVolume : quoteVolume),
                volumeReceived: round(to === base ? baseVolume : quoteVolume),
                liveRate: live !== null ? round(live, 6) : null,
                rateSeries: rates.map(x => round(x, 6)),
                base,
                quote,
            };
        })
        .sort((a, b) => b.count - a.count);

    const pairByKey = new Map(fxPairs.map(p => [`${p.base}|${p.quote}`, p]));
    const conversions = crossTransfers
        .map(t => {
            const [a, b] = [t.fromCurrency!, t.toCurrency!].sort();
            const p = pairByKey.get(`${a}|${b}`) ?? pairByKey.get(`${b}|${a}`);
            const rate = p
                ? t.fromCurrency === p.base
                    ? t.toAmount! / t.fromAmount!
                    : t.fromAmount! / t.toAmount!
                : t.toAmount! / t.fromAmount!;
            // Positive = this conversion beat your own volume-weighted average.
            const lowerIsBetter = p ? p.base === t.toCurrency : false;
            const rawPct = p && p.weightedAvgRate ? ((rate - p.weightedAvgRate) / p.weightedAvgRate) * 100 : 0;
            return {
                date: t.date,
                fromAccount: t.account,
                toAccount: t.category,
                spent: round(t.fromAmount!),
                spentCurrency: t.fromCurrency!,
                received: round(t.toAmount!),
                receivedCurrency: t.toCurrency!,
                pair: p?.pair ?? `${t.fromCurrency}/${t.toCurrency}`,
                rate: round(rate, 6),
                vsYourAvgPct: round(lowerIsBetter ? -rawPct : rawPct, 2),
            };
        })
        .sort((a, b) => (a.date < b.date ? 1 : -1));

    // -------------------------------------------------------------- accounts
    const lastUsedByAccount = new Map<string, string>();
    transactions.forEach(t => {
        const seen = lastUsedByAccount.get(t.account);
        if (!seen || t.date > seen) lastUsedByAccount.set(t.account, t.date);
    });
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
    const spendByAccountKey = new Map(spendByAccount.map(a => [norm(a.account), a]));

    const accountRows = accounts.map(a => {
        const activity = spendByAccountKey.get(norm(a.name));
        return {
            name: a.name,
            type: a.type,
            currency: a.currency,
            balance: round(a.balance),
            balanceInBase: round(a.rubEquivalent),
            balanceEnteredOn: a.balanceDate ?? null,
            spendTotal: activity?.amount ?? 0,
            spendCount: activity?.count ?? 0,
            lastUsed: lastUsedByAccount.get(a.name) ?? activity?.lastUsed ?? null,
        };
    });

    // ----------------------------------------------------------------- trips
    const tripRows = trips
        .map(trip => {
            const txs = resolveTripActiveTransactions(trip, transactions);
            const total = sum(txs.map(baseAmount));
            const days = Math.max(1, dayDiff(trip.startDate, trip.endDate) + 1);
            const cats = new Map<string, number>();
            txs.forEach(t => cats.set(t.category, (cats.get(t.category) || 0) + baseAmount(t)));
            return {
                name: trip.name,
                startDate: trip.startDate,
                endDate: trip.endDate,
                days,
                total: round(total),
                perDay: round(total / days),
                transactionCount: txs.length,
                topCategories: [...cats.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([category, amount]) => ({ category, amount: round(amount) })),
            };
        })
        .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

    // ---------------------------------------------------------- data quality
    const taggedExpenses = expenses.length - untaggedExpenses;
    const notedRows = flows.filter(t => (t.note || '').trim().length > 0).length;
    const uncategorized = flows.filter(t => !t.category || /^uncategorized$/i.test(t.category)).length;
    const unmappedCategories = [...catMap.keys()].filter(c => getGlobalCategory(c) === 'Other' && c !== 'Other');

    const dupKeys = new Map<string, number>();
    flows.forEach(t => {
        const k = `${t.date}|${t.amount}|${t.account}|${payeeOf(t) ?? ''}`;
        dupKeys.set(k, (dupKeys.get(k) || 0) + 1);
    });
    const duplicateSuspects = [...dupKeys.values()].filter(n => n > 1).length;

    const emptyMonths = monthly.filter(m => m.expenseCount === 0 && m.incomeCount === 0).map(m => m.month);
    const accountsWithoutBalance = accountRows.filter(a => a.balance === 0).map(a => a.name);

    const dataQuality = {
        payeeTagCoveragePct: expenses.length ? share(taggedExpenses, expenses.length) : 0,
        untaggedExpenses,
        multiTagRows,
        noteCoveragePct: flows.length ? share(notedRows, flows.length) : 0,
        uncategorizedRows: uncategorized,
        categoriesFallingBackToOther: unmappedCategories,
        transfersMissingCurrencyLegs: transfersMissingLegData,
        rowsNotInBaseCurrency: offBaseRows,
        repeatedIdenticalRows: {
            note: 'Groups of rows sharing date + amount + account + payee. Usually genuine repeat purchases (two coffees in one day), not import errors — flagged so the model does not silently treat them as double-counting.',
            groups: duplicateSuspects,
        },
        monthsWithNoRecords: emptyMonths,
        accountsWithZeroBalance: accountsWithoutBalance,
        knownLimitations: [
            'Wallet balances are typed in by hand and are NOT recalculated from transactions — treat them as a checkpoint, not a derived figure.',
            'There is no opening balance in the source export, so a running balance cannot be reconstructed from the ledger.',
            'Transfers carry no category and no tag; they move money between accounts and are excluded from income and expense totals.',
            'Expense/income amounts are pre-converted to the base currency by the source app at the transaction date; the rate used is not recorded.',
        ],
    };

    // ---------------------------------------------------------------- ledgers
    // Full history, not a truncated tail. Row format is documented in meta.schema.
    const ledgerColumns = [
        'date',
        'type',
        'category',
        'group',
        'amountInBase',
        'account',
        'payee',
        'nativeAmount',
        'nativeCurrency',
        'note',
    ];
    const ledgerRows = [...flows]
        .sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : (a.index ?? 0) - (b.index ?? 0)))
        .map(t => [
            t.date,
            t.type,
            t.category || 'Uncategorized',
            t.type === 'expense' ? getGlobalCategory(t.category) : null,
            round(baseAmount(t)),
            t.account || 'Unknown',
            payeeOf(t),
            round(nativeAmountOf(t)),
            nativeCurrencyOf(t, baseCurrency),
            (t.note || '').trim() || null,
        ]);

    const transferColumns = [
        'date',
        'fromAccount',
        'toAccount',
        'fromAmount',
        'fromCurrency',
        'toAmount',
        'toCurrency',
        'note',
    ];
    const transferRows = [...transfers]
        .sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : (a.index ?? 0) - (b.index ?? 0)))
        .map(t => [
            t.date,
            t.account || 'Unknown',
            t.category || 'Unknown',
            t.fromAmount !== undefined ? round(t.fromAmount) : round(Math.abs(t.amount)),
            t.fromCurrency ?? t.originalCurrency ?? null,
            t.toAmount !== undefined ? round(t.toAmount) : null,
            t.toCurrency ?? null,
            (t.note || '').trim() || null,
        ]);

    // ------------------------------------------------------------------ meta
    const usedCurrencies = new Set<string>([baseCurrency]);
    spendByCurrency.forEach(c => usedCurrencies.add(c.currency));
    accounts.forEach(a => usedCurrencies.add(a.currency.toUpperCase()));
    transfers.forEach(t => {
        if (t.fromCurrency) usedCurrencies.add(t.fromCurrency);
        if (t.toCurrency) usedCurrencies.add(t.toCurrency);
    });
    const ratesSnapshot: Record<string, number> = {};
    if (liveRates?.rates) {
        [...usedCurrencies].sort().forEach(c => {
            const v = liveRates.rates[c];
            if (typeof v === 'number' && isFinite(v)) ratesSnapshot[c] = round(v, 6);
        });
    }

    return {
        meta: {
            generatedAt: new Date().toISOString(),
            generatedBy: 'Grow Money — AI Analyst Export',
            schemaVersion: 2,
            baseCurrency,
            readMeFirst: [
                `Every field named "amount", "*InBase", "total", "net", "spend*" or "income" is expressed in ${baseCurrency} unless the field name says otherwise.`,
                'Expenses are stored as POSITIVE magnitudes everywhere in this file. Do not add minus signs.',
                'Transfers are movements between the user\'s own accounts. They are NOT spending and NOT income, and their amounts are in each leg\'s own currency — never in the base currency.',
                'Percentages are already percentages (12.5 means 12.5%), not fractions.',
                'Aggregates cover the FULL history. The ledger at the end is also complete — nothing is truncated.',
            ],
            coverage: {
                firstDate,
                lastDate,
                months: monthKeys.length,
                completeMonths: completeMonths.length,
                records: {
                    total: transactions.length,
                    expenses: expenses.length,
                    income: incomes.length,
                    transfers: transfers.length,
                },
            },
            completeness: {
                lastMonth,
                lastMonthDaysCovered,
                lastMonthTotalDays,
                lastMonthIsPartial,
                warning: lastMonthIsPartial
                    ? `${lastMonth} is INCOMPLETE (${lastMonthDaysCovered} of ${lastMonthTotalDays} days). Exclude it from averages, trends and forecasts, or annualise it explicitly — otherwise it will look like a spending collapse.`
                    : 'All months in range are complete.',
            },
            schema: {
                ledger: {
                    format: 'columns + rows (CSV-in-JSON). rows[i][j] corresponds to columns[j].',
                    columns: ledgerColumns,
                    notes: [
                        `amountInBase — magnitude in ${baseCurrency}.`,
                        'nativeAmount/nativeCurrency — the amount actually charged on the account (e.g. THB, USDT).',
                        'payee — the tag (merchant/description). Notes are rarely filled; payee falls back to note.',
                        'group — coarse category group; null for income rows.',
                    ],
                },
                transferLedger: {
                    format: 'columns + rows (CSV-in-JSON).',
                    columns: transferColumns,
                    notes: [
                        'Empty toAmount/toCurrency means a same-currency move between accounts (no conversion happened).',
                        'A filled, different toCurrency means a real currency conversion — see fx.conversions.',
                    ],
                },
            },
        },

        profile: {
            baseCurrency,
            residence: 'Bangkok, Thailand (Punnawithi area), DTV visa. Previously lived in Pattaya — older rent and local spending in the history belongs to that period, so month-over-month comparisons cross a relocation.',
            travel: 'Frequent travel across Asia — Philippines, Indonesia, China.',
            work: 'Remote, mixed standard and 2/2 shift schedule',
            habits: 'Heavy crypto and P2P (Bybit) usage, Apple ecosystem, values tight planning and "more for less"',
            spendingCurrencies: spendByCurrency.map(c => c.currency),
            incomeStreams: incomeBySource.map(s => s.source),
            accountsInUse: spendByAccount.map(a => a.account),
            plannedMonthlySalary: paycheck?.plannedSalary ?? null,
            overtimeHourlyRate: paycheck?.hourlyRate ?? null,
        },

        dataQuality,

        summary: {
            totalIncome: round(totalIncome),
            totalExpenses: round(totalExpense),
            netSaved: round(totalIncome - totalExpense),
            savingsRatePct: totalIncome > 0 ? round(((totalIncome - totalExpense) / totalIncome) * 100) : null,
            avgExpenseTicket: expenses.length ? round(totalExpense / expenses.length) : 0,
            medianExpenseTicket: round(median(expenses.map(baseAmount))),
            expenseTransactionsPerMonth: completeMonthly.length
                ? round(mean(completeMonthly.map(m => m.expenseCount)), 1)
                : 0,
            incomeConcentrationTopSourcePct: topSourceShare,
            netWorthInBase: netWorth !== undefined ? round(netWorth) : null,
            netWorthNote:
                'Net worth is the sum of manually entered wallet balances converted at live rates — it is a self-reported checkpoint, not derived from the ledger.',
        },

        monthly: {
            note: 'One row per calendar month across the whole range. Months with no records are kept as zeros so gaps are visible.',
            rows: monthly,
            averages,
        },

        expenses: {
            total: round(totalExpense),
            count: expenses.length,
            byCategory,
            byGroup,
            byCurrency: spendByCurrency,
            byAccount: spendByAccount,
            byWeekday,
            monthlyByCategory,
            monthlyByCurrency,
            categoryTrends: {
                note: 'Latest complete month vs the average of the three months before it. Sorted by absolute change.',
                rows: categoryTrends,
            },
            largest: [...expenses]
                .sort((a, b) => baseAmount(b) - baseAmount(a))
                .slice(0, 30)
                .map(t => ({
                    date: t.date,
                    category: t.category,
                    payee: payeeOf(t),
                    amount: round(baseAmount(t)),
                    account: t.account,
                    nativeAmount: round(nativeAmountOf(t)),
                    nativeCurrency: nativeCurrencyOf(t, baseCurrency),
                })),
        },

        payees: {
            note: 'Merchant/description level, taken from the tag field. Amounts are attributed to the first tag on a row, so rows + longTail + untagged add up to expenses.total.',
            uniqueCount: payeesAll.length,
            listed: payees.length,
            rows: payees,
            longTail: {
                note: 'Payees seen only once, rolled up.',
                count: payeesTail.length,
                amount: round(sum(payeesTail.map(p => p.amount))),
            },
            untagged: {
                note: 'Expenses with neither a tag nor a usable note.',
                count: untaggedExpenses,
                amount: round(untaggedAmount),
            },
        },

        recurring: {
            note: [
                'Repeating charges detected from cadence, not from a subscription flag.',
                'amountVariationPct below ~15% is a fixed charge (subscription, rent); above ~50% is a variable habit (taxi, groceries).',
                'estimateMethod says how estimatedMonthlyCost was derived. "cadence" = median charge extrapolated over the billing interval, so it IS the recurring price. "run-rate" = everything actually paid divided by the months the charge was alive, used for clustered or irregular spending — there it is a spending rate, NOT a subscription price.',
                'status "lapsed" means nothing has been charged for far longer than usual, judged against the average gap between charges rather than the median (a habit that clusters has a median gap near zero).',
            ].join(' '),
            estimatedFixedMonthlyCost: round(
                sum(recurring.filter(r => r.status === 'active' && r.amountVariationPct < 25).map(r => r.estimatedMonthlyCost))
            ),
            rows: recurring,
            taggedAsSubscriptions: {
                note: 'Rows the source data itself files under a subscription category.',
                total: round(sum(subscriptions.map(s => s.totalPaid))),
                rows: subscriptions,
            },
        },

        income: {
            total: round(totalIncome),
            count: incomes.length,
            bySource: incomeBySource,
            monthlyBySource: monthlyByIncomeSource,
            concentrationTopSourcePct: topSourceShare,
        },

        fx: {
            note: [
                'Rates below are the ones actually paid on the user\'s own conversions, derived from both legs of cross-currency transfers. This is where conversion losses are visible.',
                'pairs[].spreadPct is the gap between the best and the worst rate ever taken on that pair — the money left on the table by timing and venue.',
                'conversions[].vsYourAvgPct is signed from the user\'s point of view: positive means that conversion beat their own volume-weighted average for the pair, negative means it was worse.',
            ].join(' '),
            crossCurrencyConversions: crossTransfers.length,
            sameCurrencyMoves: internalTransfers.length,
            pairs: fxPairs,
            conversions,
            liveRates: {
                note: `Market reference rates, ${baseCurrency} per 1 unit of the listed currency.`,
                asOf: liveRates?.date ?? null,
                isLive: liveRates?.isLive ?? false,
                rates: ratesSnapshot,
            },
        },

        accounts: {
            note: 'Balances are entered manually by the user and are not moved by transactions. balanceEnteredOn is when that number was last confirmed. A day-by-day balance history cannot be reconstructed from the ledger — the source export carries no opening balance.',
            totalNetWorthInBase: netWorth !== undefined ? round(netWorth) : null,
            rows: accountRows,
        },

        trips: {
            note: 'User-defined travel periods with the expenses attributed to them.',
            count: tripRows.length,
            rows: tripRows,
        },

        ledger: {
            note: 'Complete expense + income history, oldest first.',
            rowCount: ledgerRows.length,
            columns: ledgerColumns,
            rows: ledgerRows,
        },

        transferLedger: {
            note: 'Complete transfer history, oldest first. Amounts are in each leg\'s own currency.',
            rowCount: transferRows.length,
            columns: transferColumns,
            rows: transferRows,
        },
    };
}

export type AIExportPayload = ReturnType<typeof buildAIExportPayload>;

// ---------------------------------------------------------------------------
// serialisation
// ---------------------------------------------------------------------------

// JSON.stringify(..., 2) would put every ledger cell on its own line and triple the
// file size. This keeps the nested structure readable while collapsing leaf arrays
// (ledger rows, series) onto a single line.
export function toPrettyJson(value: unknown, indent = 2): string {
    const pad = (depth: number) => ' '.repeat(depth * indent);

    const walk = (v: unknown, depth: number): string => {
        if (v === null || v === undefined) return 'null';
        if (typeof v === 'number') return isFinite(v) ? String(v) : 'null';
        if (typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);

        if (Array.isArray(v)) {
            if (v.length === 0) return '[]';
            const isLeaf = v.every(x => x === null || typeof x !== 'object');
            if (isLeaf) return JSON.stringify(v);
            return `[\n${v.map(x => pad(depth + 1) + walk(x, depth + 1)).join(',\n')}\n${pad(depth)}]`;
        }

        const entries = Object.entries(v as Record<string, unknown>).filter(([, val]) => val !== undefined);
        if (entries.length === 0) return '{}';
        return `{\n${entries
            .map(([k, val]) => `${pad(depth + 1)}${JSON.stringify(k)}: ${walk(val, depth + 1)}`)
            .join(',\n')}\n${pad(depth)}}`;
    };

    return walk(value, 0);
}
