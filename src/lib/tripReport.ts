import type { Transaction, Trip } from '../types';
import { getCurrencyMeta } from './currencies';
import { dateKeyOf } from './periods';
import { formatNative, formatRub } from './tripFormat';
import { CURRENCY_COUNTRY, homeCountry, tripIcon } from './tripIcons';
import {
    budgetStatus, categoryBreakdown, compareWithHome, dailySpending, daySections, tripMetrics,
    type BudgetStatus, type CategoryShare, type HomeComparison, type TripMetrics,
} from './tripStats';
import { daysBetween, localDayKey, resolveTrip, shiftDay, tripStatus, type ResolvedTrip, type TripStatus } from './tripUtils';
import { getTransactionNote, getTransactionTitle } from './utils';

// A trip's numbers put together for someone else to read: the PDF a trip page shares. It is
// written in one currency — rubles, as the app counts, or the reader's own money, so that a
// friend in Bangkok reads the trip in baht.

/** The parts of the report that can be left out; the totals always go in. */
export interface ReportParts {
    budget: boolean;
    chart: boolean;
    categories: boolean;
    biggest: boolean;
    home: boolean; // everyday spending against home tells how one lives at home: in only when asked
    payments: boolean;
}

export const DEFAULT_REPORT_PARTS: ReportParts = { budget: true, chart: true, categories: true, biggest: true, home: false, payments: true };

/** The money a report is written in: rubles, or another currency at one rate. */
export interface ReportCurrency {
    code: string;           // "RUB", "THB", …
    rubPerUnit: number;     // what one unit of it costs in rubles (1 for rubles)
    rateDay: string | null; // the day of that rate; null for rubles
}

export const RUBLES: ReportCurrency = { code: 'RUB', rubPerUnit: 1, rateDay: null };

export interface ReportPayment {
    id: string;
    day: string;
    title: string;
    note: string;
    category: string;
    amount: number;       // the trip's part, in the report's currency
    whole: number | null; // the whole payment, when the trip counts only a part of it
    paid: string | null;  // what was paid when it was another currency: "1 052 ¥", "1 050 ₽"
}

export interface ReportSection {
    key: string; // a day, or BOOKED_AHEAD / "after"
    title: string;
    note?: string;
    total: number;
    payments: ReportPayment[];
}

export interface TripReport {
    name: string;
    icon: string | null;
    startDate: string;
    endDate: string;
    status: TripStatus;
    dayOfTrip: number | null;    // today's day of a trip under way
    coveredUntil: string | null; // the last day the statement reaches, when it stops before the trip's end
    currency: ReportCurrency;
    metrics: TripMetrics;
    budget: BudgetStatus | null;
    paymentCount: number;
    categories: CategoryShare[];
    daily: { day: string; amount: number }[];
    biggest: ReportPayment[];
    comparison: HomeComparison | null;
    sections: ReportSection[];
    madeOn: string;
}

const BIGGEST_SHOWN = 10;

const paidIn = (t: Transaction) => (t.originalCurrency || 'RUB').toUpperCase();

// A payment in the report's currency: as paid when it was paid in that currency, else its rubles at the report's rate.
const valueIn = (t: Transaction, currency: ReportCurrency): number => {
    if (currency.code === 'RUB') return Math.abs(t.amount);
    if (paidIn(t) === currency.code && t.originalAmount !== undefined) return Math.abs(t.originalAmount);
    return Math.abs(t.amount) / currency.rubPerUnit;
};

const restate = (t: Transaction, currency: ReportCurrency): Transaction => {
    const value = valueIn(t, currency);
    return { ...t, amount: t.amount < 0 ? -value : value };
};

const paymentOf = (tx: Transaction, share: number, currency: ReportCurrency): ReportPayment => {
    const whole = valueIn(tx, currency);
    const code = paidIn(tx);
    return {
        id: tx.id,
        day: dateKeyOf(tx.date) ?? tx.date.slice(0, 10),
        title: getTransactionTitle(tx),
        note: getTransactionNote(tx),
        category: tx.category,
        amount: whole * share,
        whole: share < 1 ? whole : null,
        paid: share < 1 || code === currency.code ? null : formatNative(Math.abs(tx.originalAmount ?? tx.amount), code),
    };
};

export function buildTripReport(trip: Trip, trips: Trip[], txs: Transaction[], currency: ReportCurrency = RUBLES, today = localDayKey()): TripReport {
    // The trip is found among the payments as they are — its stored lists know them by their
    // rubles — and only then is every payment restated, the home days' included.
    const found = resolveTrip(trip, txs);
    const inRubles = currency.code === 'RUB';
    const statement = inRubles ? txs : txs.map(t => restate(t, currency));
    const resolved: ResolvedTrip = inRubles ? found : {
        ...found,
        entries: found.entries.map(e => ({ ...e, tx: restate(e.tx, currency) })),
        counted: found.counted.map(t => restate(t, currency)),
    };
    const metrics = tripMetrics(trip, trips, statement, resolved);
    const status = tripStatus(trip, today);

    const counted = found.entries.filter(e => e.state === 'counted');
    const sections = daySections(trip, counted).map(({ entries, ...section }) => {
        const payments = entries.map(e => paymentOf(e.tx, e.share, currency));
        return { ...section, total: payments.reduce((sum, p) => sum + p.amount, 0), payments };
    });
    const biggest = counted
        .map(e => paymentOf(e.tx, e.share, currency))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, BIGGEST_SHOWN);
    // The budget is kept in rubles.
    const budget = budgetStatus({ ...trip, budget: trip.budget ? trip.budget / currency.rubPerUnit : trip.budget }, metrics, today);

    return {
        name: trip.name.trim(),
        icon: tripIcon(trip, txs),
        startDate: trip.startDate,
        endDate: trip.endDate,
        status,
        dayOfTrip: status === 'ongoing' ? Math.min(metrics.days, daysBetween(trip.startDate, today) + 1) : null,
        coveredUntil: metrics.daysCovered > 0 && metrics.daysCovered < metrics.days ? shiftDay(trip.startDate, metrics.daysCovered - 1) : null,
        currency,
        metrics,
        budget,
        paymentCount: counted.length,
        categories: categoryBreakdown(resolved.counted, metrics.total),
        daily: dailySpending(trip, resolved),
        biggest,
        comparison: compareWithHome(trip, resolved, metrics),
        sections,
        madeOn: today,
    };
}

// ------------------------------------------------------------------ currencies

// Country → its money; the first code listed wins (CNY over the RMB some wallets are named with).
const COUNTRY_CURRENCY: Record<string, string> = {};
for (const [code, country] of Object.entries(CURRENCY_COUNTRY)) COUNTRY_CURRENCY[country] ??= code;

/** The local money the trip spent the most in — dollars and coins left out, as they pay everywhere — or null. */
export function tripLocalCurrency(trip: Trip, txs: Transaction[]): string | null {
    const spent = new Map<string, number>();
    for (const t of resolveTrip(trip, txs).counted) {
        if (!t.originalCurrency || (dateKeyOf(t.date) ?? '') < trip.startDate) continue;
        const code = t.originalCurrency.toUpperCase();
        if (CURRENCY_COUNTRY[code]) spent.set(code, (spent.get(code) ?? 0) + Math.abs(t.amount));
    }
    return [...spent.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** The money of the country most of the spending happens in — where home is. */
export function homeCurrency(txs: Transaction[]): string | null {
    const country = homeCountry(txs);
    return country ? COUNTRY_CURRENCY[country] ?? null : null;
}

/** "฿", "$", "€" — or the code itself for money without a sign of its own. */
export function currencySign(code: string): string {
    try {
        const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(1);
        return parts.find(p => p.type === 'currency')?.value ?? code;
    } catch {
        return code;
    }
}

/** "Thai Baht" */
export function currencyName(code: string): string {
    try {
        const name = new Intl.DisplayNames(['en'], { type: 'currency' }).of(code);
        if (name && name !== code) return name;
    } catch {
        // Not a code Intl knows.
    }
    return getCurrencyMeta(code).name || code;
}

/**
 * How the report writes amounts: rubles the app's way ("126 383 ₽"), other money the way its
 * readers write it ("฿1,052"). Big amounts drop the cents; small ones keep them where a unit is
 * worth enough for them to matter ($5.11, but ฿51).
 */
export function reportMoney({ code, rubPerUnit }: ReportCurrency): (n: number) => string {
    if (code === 'RUB') return formatRub;
    const formats = new Map<number, Intl.NumberFormat | null>();
    const formatFor = (digits: number) => {
        if (!formats.has(digits)) {
            try {
                formats.set(digits, new Intl.NumberFormat('en-US', {
                    style: 'currency', currency: code, currencyDisplay: 'narrowSymbol', minimumFractionDigits: digits, maximumFractionDigits: digits,
                }));
            } catch {
                formats.set(digits, null); // a coin: the number, then its code
            }
        }
        return formats.get(digits)!;
    };
    return n => {
        const abs = Math.abs(n);
        const digits = abs >= 100 || abs === 0 ? 0 : rubPerUnit >= 10 || abs < 1 ? 2 : 0;
        const format = formatFor(digits);
        return format ? format.format(n) : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: rubPerUnit >= 1000 ? 6 : digits }).format(n)} ${code}`;
    };
}

/** "1 ฿ = 2.47 ₽", or the other way round for money worth less than a ruble: "1 ₽ = 1.82 ¥". */
export function describeRate({ code, rubPerUnit }: ReportCurrency): string {
    const number = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n);
    const sign = currencySign(code);
    return rubPerUnit >= 1 ? `1 ${sign} = ${number(rubPerUnit)} ₽` : `1 ₽ = ${number(1 / rubPerUnit)} ${sign}`;
}

/** "Japan — trip report.pdf", "Koh Kood — trip report, THB.pdf": the name without what file systems and chat apps choke on. */
export function reportFileName(report: Pick<TripReport, 'name' | 'currency'>): string {
    const name = report.name.replace(/[\\/:*?"<>|#%{}^~[\]`]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Trip';
    return `${name} — trip report${report.currency.code === 'RUB' ? '' : `, ${report.currency.code}`}.pdf`;
}
