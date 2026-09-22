import type { Transaction } from '../types';

// The dashboard is scoped to one calendar month or to everything ever imported.
export type DashboardPeriod = { kind: 'all' } | { kind: 'month'; key: string }; // key: "YYYY-MM"

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM" for a transaction date, or null when the date can't be read. */
export function monthKeyOf(dateStr: string): string | null {
    if (!dateStr) return null;
    // Parser output is ISO "YYYY-MM-DD" — take the fast path and skip Date entirely,
    // so the month never shifts with the viewer's timezone.
    if (/^\d{4}-\d{2}/.test(dateStr)) return dateStr.slice(0, 7);
    // Older local data may still hold "DD.MM.YYYY".
    const ru = dateStr.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (ru) return `${ru[3]}-${pad2(Number(ru[2]))}`;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

/** Day of month (1–31) for a transaction date, or null when unreadable. */
export function dayOfMonthOf(dateStr: string): number | null {
    if (!dateStr) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return Number(dateStr.slice(8, 10));
    const ru = dateStr.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (ru) return Number(ru[1]);
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.getUTCDate();
}

/** "YYYY-MM" of a Date in the viewer's local calendar (what "this month" means to them). */
export function monthKeyFromDate(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function shiftMonthKey(key: string, delta: number): string {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

export function daysInMonth(key: string): number {
    const [y, m] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "September 2026" (long), "Sep 2026" (short) or just "Sep" (month). */
export function monthLabel(key: string, style: 'short' | 'long' | 'month' = 'long'): string {
    const [y, m] = key.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', {
        month: style === 'long' ? 'long' : 'short',
        ...(style === 'month' ? {} : { year: 'numeric' }),
        timeZone: 'UTC',
    }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Transactions that fall inside the period (all of them for `all`). */
export function filterByPeriod<T extends { date: string }>(transactions: T[], period: DashboardPeriod): T[] {
    if (period.kind === 'all') return transactions;
    return transactions.filter(t => monthKeyOf(t.date) === period.key);
}

export interface PeriodSummary {
    income: number;
    expenses: number;
    net: number;
    savingsRate: number | null;    // net / income, null when there was no income
    operations: number;            // income + expense rows (transfers never count)
    // Month periods only:
    monthKey?: string;
    isCurrentMonth?: boolean;
    dayOfMonth?: number;           // days covered so far (full length for a finished month)
    daysInMonth?: number;
    dailyAverage?: number;         // expenses / dayOfMonth
    projectedExpenses?: number;    // current month only, see summarizePeriod for how
    projectionBasis?: 'history' | 'linear';
    prevMonthKey?: string;
    prevIncome?: number;           // previous month, whole month
    prevExpensesToDate?: number;   // previous month, through the same day of month
    prevExpensesFull?: number;     // previous month, whole month
    // Everything: completed months only, so the running month doesn't drag averages down.
    completedMonths: number;
    avgMonthlyIncome: number;
    avgMonthlyExpenses: number;
    lastDataDate: string | null;   // latest transaction date in the whole dataset
}

/**
 * Income / expense totals for the dashboard cards. Transfers are excluded everywhere:
 * they move money between the user's own wallets and are neither income nor spending.
 */
export function summarizePeriod(transactions: Transaction[], period: DashboardPeriod, now = new Date()): PeriodSummary {
    const flows = transactions.filter(t => t.type === 'income' || t.type === 'expense');

    // Per-month totals across the whole dataset — needed for averages and comparisons
    // regardless of which period is selected.
    const byMonth = new Map<string, { income: number; expenses: number }>();
    let lastDataDate: string | null = null;
    for (const t of flows) {
        const key = monthKeyOf(t.date);
        if (!key) continue;
        const bucket = byMonth.get(key) ?? { income: 0, expenses: 0 };
        if (t.type === 'income') bucket.income += Math.abs(t.amount);
        else bucket.expenses += Math.abs(t.amount);
        byMonth.set(key, bucket);
        if (!lastDataDate || t.date > lastDataDate) lastDataDate = t.date;
    }

    const currentKey = monthKeyFromDate(now);
    const completed = Array.from(byMonth.entries()).filter(([key]) => key < currentKey);
    const completedMonths = completed.length;
    const avgMonthlyIncome = completedMonths ? completed.reduce((s, [, m]) => s + m.income, 0) / completedMonths : 0;
    const avgMonthlyExpenses = completedMonths ? completed.reduce((s, [, m]) => s + m.expenses, 0) / completedMonths : 0;

    const base = { completedMonths, avgMonthlyIncome, avgMonthlyExpenses, lastDataDate };

    if (period.kind === 'all') {
        let income = 0, expenses = 0;
        for (const m of byMonth.values()) { income += m.income; expenses += m.expenses; }
        const net = income - expenses;
        return {
            ...base,
            income, expenses, net,
            savingsRate: income > 0 ? net / income : null,
            operations: flows.length,
        };
    }

    const key = period.key;
    const month = byMonth.get(key) ?? { income: 0, expenses: 0 };
    const isCurrentMonth = key === currentKey;
    const totalDays = daysInMonth(key);
    const dayOfMonth = isCurrentMonth ? Math.min(now.getDate(), totalDays) : totalDays;
    const dailyAverage = month.expenses / Math.max(dayOfMonth, 1);

    const prevMonthKey = shiftMonthKey(key, -1);
    const prev = byMonth.get(prevMonthKey);
    let prevExpensesToDate = 0;
    // What the finished months spent AFTER this day of the month. Rent and other big
    // bills land on fixed days, so "spent so far ÷ days × month length" is badly off
    // early in the month; adding the typical remainder instead follows the real rhythm.
    const remainderByMonth = new Map<string, number>();
    for (const t of flows) {
        if (t.type !== 'expense') continue;
        const tKey = monthKeyOf(t.date);
        const day = dayOfMonthOf(t.date);
        if (!tKey || day === null) continue;
        if (prev && tKey === prevMonthKey && day <= dayOfMonth) prevExpensesToDate += Math.abs(t.amount);
        if (isCurrentMonth && tKey < currentKey && day > dayOfMonth) {
            remainderByMonth.set(tKey, (remainderByMonth.get(tKey) ?? 0) + Math.abs(t.amount));
        }
    }

    let projectedExpenses: number | undefined;
    let projectionBasis: PeriodSummary['projectionBasis'];
    if (isCurrentMonth) {
        if (completedMonths > 0) {
            // Months with nothing left after this day still count — as zero.
            const typicalRemainder = completed.reduce((sum, [k]) => sum + (remainderByMonth.get(k) ?? 0), 0) / completedMonths;
            projectedExpenses = month.expenses + typicalRemainder;
            projectionBasis = 'history';
        } else {
            projectedExpenses = dailyAverage * totalDays;
            projectionBasis = 'linear';
        }
    }

    const net = month.income - month.expenses;
    return {
        ...base,
        income: month.income,
        expenses: month.expenses,
        net,
        savingsRate: month.income > 0 ? net / month.income : null,
        operations: flows.filter(t => monthKeyOf(t.date) === key).length,
        monthKey: key,
        isCurrentMonth,
        dayOfMonth,
        daysInMonth: totalDays,
        dailyAverage,
        projectedExpenses,
        projectionBasis,
        prevMonthKey,
        prevIncome: prev?.income,
        prevExpensesToDate: prev ? prevExpensesToDate : undefined,
        prevExpensesFull: prev?.expenses,
    };
}

/**
 * The day of the month `year`/`month` (0-based) has reached when it is the viewer's running
 * month, else null. Year forecasts add what finished months usually brought after this day,
 * so a month that is only partly over isn't counted as if it had ended.
 */
export function runningMonthDay(year: number, month: number, now = new Date()): number | null {
    return year === now.getFullYear() && month === now.getMonth() ? now.getDate() : null;
}

export interface YearOutlook {
    forecast: number;                // whole year: months so far, the rest of the running month, an average month for each one left
    lastYearTotal: number;           // last year, as far as the data reaches
    lastYearFromMonth: number;       // first month (0–11) last year's data covers; 0 when it covers the whole year
    changeVsLastYear: number | null; // forecast vs last year over the months both cover (0.15 = +15%); null without last-year data
}

/**
 * Where one flow (income or expenses) is heading this year, and how that compares with last
 * year. `monthTotals` is keyed "YYYY-M" with a 0-based month, as the Expenses and Income pages
 * build it. Last year is compared only over the months its data covers: when the history
 * starts partway through last year, a whole-year forecast against those few months reads as
 * a jump that never happened (12 months of this year against 8 of last).
 */
export function yearOutlook({ monthTotals, year, month, avgMonthly, restOfRunningMonth }: {
    monthTotals: Record<string, number>;
    year: number;
    month: number;              // the month the page looks at, 0-based
    avgMonthly: number;         // the page's average complete month
    restOfRunningMonth: number; // what finished months usually add after today; 0 unless `month` is running
}): YearOutlook {
    const totalOf = (y: number, m: number) => monthTotals[`${y}-${m}`] || 0;
    const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);
    const thisYear = Array.from({ length: 12 }, (_, m) =>
        m < month ? totalOf(year, m) : m === month ? totalOf(year, m) + restOfRunningMonth : avgMonthly);

    const lastYear = year - 1;
    const covered = Object.keys(monthTotals).map(key => key.split('-').map(Number));
    const lastYearMonths = covered.filter(([y]) => y === lastYear).map(([, m]) => m);
    const lastYearTotal = sum(lastYearMonths.map(m => totalOf(lastYear, m)));
    const lastYearFromMonth = covered.some(([y]) => y < lastYear) || lastYearMonths.length === 0 ? 0 : Math.min(...lastYearMonths);

    return {
        forecast: sum(thisYear),
        lastYearTotal,
        lastYearFromMonth,
        changeVsLastYear: lastYearTotal > 0 ? (sum(thisYear.slice(lastYearFromMonth)) - lastYearTotal) / lastYearTotal : null,
    };
}

/** Signed percentage change, e.g. "+8%" / "−12%"; null when there is nothing to compare with. */
export function formatDelta(current: number, previous: number | undefined): string | null {
    if (previous === undefined || previous <= 0) return null;
    const pct = ((current - previous) / previous) * 100;
    if (!isFinite(pct)) return null;
    const rounded = Math.round(pct);
    if (rounded === 0) return '±0%';
    return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}%`;
}
