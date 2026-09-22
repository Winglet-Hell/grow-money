import type { Transaction } from '../types';
import { dayOfMonthOf, daysInMonth, monthKeyOf, monthKeyFromDate } from './periods';

// ---------------------------------------------------------------------------
// Recurring payments found by rhythm.
//
// The export carries no "subscription" flag, so a series is inferred: the same
// tag/note within the same category, charged at a steady interval for a steady
// amount. Amounts are compared in the charge's own currency (THB, USD, …) so a
// moving RUB rate does not break a perfectly regular 199 THB subscription.
// ---------------------------------------------------------------------------

export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type SeriesStatus = 'active' | 'missed' | 'ended';

export interface RecurringCharge {
    date: string;       // "YYYY-MM-DD"
    currency: string;   // what this charge was paid in ('RUB' when the export has no wallet currency)
    amount: number;     // in `currency`
    amountRub: number;
    comparable: boolean; // paid in the series' currency family, so it counts towards the typical amount
    ids: string[];      // transactions merged into this charge (same day)
}

export interface RecurringSeries {
    id: string;                 // stable key, used for "hide this one"
    name: string;               // tag / note as written in the export
    category: string;
    account: string;            // most frequent account
    currency: string;           // the currency most charges were paid in; 'RUB' for a truly mixed series
    cadence: Cadence;
    intervalDays: number;       // median gap between charges
    amount: number;             // current charge, in `currency` (median of the latest comparable charges)
    amountRub: number;          // current charge, in RUB (median of the latest charges)
    monthlyRub: number;         // typical charge normalised to a month
    charges: RecurringCharge[]; // ascending by date
    count: number;
    firstDate: string;
    lastDate: string;
    nextDate: string;           // lastDate + intervalDays
    status: SeriesStatus;
    regularity: number;         // share of gaps within tolerance (0–1)
    isNew: boolean;             // first seen within the last two cycles
    fromCategoryHint: boolean;  // sits in the user's own "Subscriptions" category
    priceChange?: { from: number; to: number }; // last charge vs the ones before, in `currency`
}

export interface RecurringSummary {
    series: RecurringSeries[];   // everything detected, hidden ones excluded
    hidden: RecurringSeries[];   // detected but hidden by the user
    active: RecurringSeries[];
    missed: RecurringSeries[];
    ended: RecurringSeries[];
    monthlyRub: number;          // active series, normalised to a month
    upcoming: RecurringSeries[]; // active, next charge within `horizonDays`
    dueThisMonthRub: number;     // active charges still expected before the month ends
    dataEnd: string | null;      // newest transaction date — the "now" the statuses use
}

export interface DetectOptions {
    now?: Date;
    hiddenIds?: string[];
    horizonDays?: number;        // window for `upcoming`, default 30
}

const CADENCES: { cadence: Cadence; min: number; max: number; tolerance: number; perMonth: number }[] = [
    { cadence: 'weekly',    min: 6,   max: 8,   tolerance: 2,  perMonth: 52 / 12 },
    { cadence: 'monthly',   min: 26,  max: 35,  tolerance: 5,  perMonth: 1 },
    { cadence: 'quarterly', min: 84,  max: 98,  tolerance: 10, perMonth: 1 / 3 },
    { cadence: 'yearly',    min: 350, max: 380, tolerance: 20, perMonth: 1 / 12 },
];

const MIN_CHARGES = 3;           // a rhythm needs at least two gaps
const MIN_REGULARITY = 0.6;      // share of gaps that must sit near the median
const MIN_STABILITY = 0.6;       // share of charges that must sit near the median amount
const AMOUNT_TOLERANCE = 0.25;   // ± around the median, same currency
const AMOUNT_TOLERANCE_RUB = 0.35; // looser when currencies were mixed and RUB is all we can compare
const DOMINANT_SHARE = 0.6;      // share of charges one currency family needs to speak for the series
const ENDED_AFTER = 1.75;        // intervals since the last charge → treated as ended
const PRICE_CHANGE = 0.10;
const RECENT_CHARGES = 3;        // what a series costs and when it lands *now*: its latest charges

const DAY_MS = 86_400_000;
const dayNumber = (date: string) => Math.round(Date.parse(date.slice(0, 10)) / DAY_MS);
const isoFromDayNumber = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
// The viewer's calendar date, not the UTC one (02:00 in Bangkok is still yesterday in UTC).
const localIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const normalize = (s: string) =>
    (s || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();

const isSubscriptionCategory = (category: string) => /subscri|подпис/i.test(category);

// Dollar stablecoins are dollars for the purpose of "is this the same 62 bucks every month".
const currencyFamily = (code: string) => (code === 'USDT' || code === 'USDC' ? 'USD' : code);
const chargeCurrency = (t: Transaction) =>
    t.originalCurrency && t.originalAmount !== undefined ? t.originalCurrency : 'RUB';

function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mostFrequent(values: string[]): string {
    const counts = new Map<string, number>();
    let best = values[0] ?? '';
    for (const v of values) {
        const n = (counts.get(v) ?? 0) + 1;
        counts.set(v, n);
        if (n > (counts.get(best) ?? 0)) best = v;
    }
    return best;
}

/** Display name for a transaction: its tags, else the note, else the category. */
function seriesName(t: Transaction): string {
    const tags = Array.isArray(t.tags) ? t.tags.filter(Boolean).join(', ') : '';
    return tags || t.note || t.category;
}

export function detectRecurring(transactions: Transaction[], options: DetectOptions = {}): RecurringSummary {
    const now = options.now ?? new Date();
    const hidden = new Set(options.hiddenIds ?? []);
    const horizonDays = options.horizonDays ?? 30;

    const expenses = transactions.filter(t => t.type === 'expense' && t.date);
    let dataEnd: string | null = null;
    for (const t of transactions) if (t.date && (!dataEnd || t.date > dataEnd)) dataEnd = t.date.slice(0, 10);

    // 1. Group by what the charge is (tag/note) within its category.
    const groups = new Map<string, Transaction[]>();
    for (const t of expenses) {
        const key = `${normalize(seriesName(t))}|${normalize(t.category)}`;
        if (!key.startsWith('|')) (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
    }

    const series: RecurringSeries[] = [];
    const dataEndDay = dayNumber(dataEnd ?? localIso(now));

    for (const [key, list] of groups) {
        const hinted = isSubscriptionCategory(list[0].category);
        const minCharges = hinted ? 2 : MIN_CHARGES;
        if (list.length < minCharges) continue;

        // 2. One charge per day (split payments for the same thing merge), each in the
        //    currency it was actually paid in. A day that mixes currencies is kept in RUB.
        const byDay = new Map<string, RecurringCharge>();
        for (const t of list) {
            const date = t.date.slice(0, 10);
            const rub = Math.abs(t.amount);
            const own = chargeCurrency(t);
            const charge = byDay.get(date) ?? { date, currency: own, amount: 0, amountRub: 0, comparable: false, ids: [] };
            if (charge.currency !== own) {
                charge.currency = 'RUB';
                charge.amount = charge.amountRub;
            }
            charge.amount += charge.currency === 'RUB' ? rub : Math.abs(t.originalAmount ?? rub);
            charge.amountRub += rub;
            charge.ids.push(t.id);
            byDay.set(date, charge);
        }
        const charges = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
        if (charges.length < minCharges) continue;

        // The series speaks the currency most of its charges were paid in. A stray payment
        // from another wallet stays in the history in its own currency but is left out of
        // the amount comparison; only a genuinely mixed series falls back to RUB, which is
        // the one figure every row has.
        const families = charges.map(c => currencyFamily(c.currency));
        const family = mostFrequent(families);
        const dominantShare = families.filter(f => f === family).length / families.length;
        const mixed = dominantShare < DOMINANT_SHARE;
        const displayCurrency = mixed ? 'RUB' : mostFrequent(charges.filter(c => currencyFamily(c.currency) === family).map(c => c.currency));
        for (const c of charges) {
            c.comparable = mixed || currencyFamily(c.currency) === family;
            if (mixed) { c.currency = 'RUB'; c.amount = c.amountRub; }
        }

        // 3. Rhythm: the median gap picks the cadence, then most gaps must sit near it.
        const days = charges.map(c => dayNumber(c.date));
        const gaps = days.slice(1).map((d, i) => d - days[i]);
        const intervalDays = median(gaps);
        const spec = CADENCES.find(c => intervalDays >= c.min && intervalDays <= c.max);
        if (!spec) continue;
        const regularity = gaps.filter(g => Math.abs(g - intervalDays) <= spec.tolerance).length / gaps.length;

        // 4. Amount: most comparable charges must sit near their median.
        const amounts = charges.filter(c => c.comparable).map(c => c.amount);
        const typical = median(amounts);
        const tolerance = mixed ? AMOUNT_TOLERANCE_RUB : AMOUNT_TOLERANCE;
        const stability = amounts.filter(a => Math.abs(a - typical) <= typical * tolerance).length / amounts.length;

        if (!hinted && (regularity < MIN_REGULARITY || stability < MIN_STABILITY)) continue;

        // 5. Status is judged against the newest data, not the wall clock: a stale export
        //    would otherwise mark every subscription as missed.
        const last = charges[charges.length - 1];
        const sinceLast = dataEndDay - dayNumber(last.date);
        let status: SeriesStatus = 'active';
        if (sinceLast > intervalDays * ENDED_AFTER) status = 'ended';
        else if (sinceLast > intervalDays + spec.tolerance) status = 'missed';

        // A price change is only meaningful in the series' own currency (in a mixed series
        // the RUB figures move with the exchange rate) and only when the latest charge is
        // itself comparable.
        const previous = amounts.slice(0, -1);
        const previousTypical = median(previous);
        const priceChange = !mixed && last.comparable && previous.length >= 2 && previousTypical > 0
            && Math.abs(last.amount - previousTypical) > previousTypical * PRICE_CHANGE
            ? { from: previousTypical, to: last.amount }
            : undefined;

        // The price shown is today's: the median of the latest charges, so a rise that has
        // stuck replaces the old price while one odd charge doesn't move it. The whole history
        // above only decides whether this is a steady series at all.
        const currentAmount = median(amounts.slice(-RECENT_CHARGES));
        const amountRub = median(charges.slice(-RECENT_CHARGES).map(c => c.amountRub));
        const first = charges[0];

        series.push({
            id: `${key}|${displayCurrency}`,
            name: seriesName(list[0]),
            category: list[0].category,
            account: mostFrequent(list.map(t => t.account)),
            currency: displayCurrency,
            cadence: spec.cadence,
            intervalDays,
            amount: currentAmount,
            amountRub,
            monthlyRub: amountRub * spec.perMonth,
            charges,
            count: charges.length,
            firstDate: first.date,
            lastDate: last.date,
            nextDate: isoFromDayNumber(dayNumber(last.date) + intervalDays),
            status,
            regularity,
            isNew: dataEndDay - dayNumber(first.date) <= intervalDays * 2,
            fromCategoryHint: hinted,
            priceChange,
        });
    }

    // Biggest first; ties by name.
    series.sort((a, b) => b.monthlyRub - a.monthlyRub || a.name.localeCompare(b.name));

    const visible = series.filter(s => !hidden.has(s.id));
    const hiddenSeries = series.filter(s => hidden.has(s.id));
    const active = visible.filter(s => s.status === 'active');
    const missed = visible.filter(s => s.status === 'missed');
    const ended = visible.filter(s => s.status === 'ended');

    const todayDay = dayNumber(localIso(now));
    const upcoming = active
        .filter(s => {
            const next = dayNumber(s.nextDate);
            return next >= todayDay - 1 && next <= todayDay + horizonDays;
        })
        .sort((a, b) => a.nextDate.localeCompare(b.nextDate));

    // Charges still expected before this calendar month ends.
    const monthKey = monthKeyFromDate(now);
    const monthEndDay = dayNumber(`${monthKey}-${String(daysInMonth(monthKey)).padStart(2, '0')}`);
    const dueThisMonthRub = active.reduce((sum, s) => {
        const next = dayNumber(s.nextDate);
        return next >= todayDay && next <= monthEndDay ? sum + s.amountRub : sum;
    }, 0);

    return {
        series: visible,
        hidden: hiddenSeries,
        active,
        missed,
        ended,
        monthlyRub: active.reduce((sum, s) => sum + s.monthlyRub, 0),
        upcoming,
        dueThisMonthRub,
        dataEnd,
    };
}

export const CADENCE_LABEL: Record<Cadence, string> = {
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    yearly: 'Yearly',
};

/**
 * Day of the month the series lands on lately (median of its latest charges), for "around
 * the 12th" labels — a bill that moved from the 17th to the end of the month says so.
 */
export function typicalDayOfMonth(series: RecurringSeries): number | null {
    if (series.cadence !== 'monthly') return null;
    const days = series.charges.slice(-RECENT_CHARGES).map(c => dayOfMonthOf(c.date)).filter((d): d is number => d !== null);
    if (!days.length) return null;
    // Charges on either side of the month boundary (the 30th, the 1st) would median out
    // mid-month; count early days as the end of the month before them instead.
    const straddles = Math.max(...days) - Math.min(...days) > 15;
    const day = Math.round(median(straddles ? days.map(d => (d <= 15 ? d + 31 : d)) : days));
    return day > 31 ? day - 31 : day;
}

/** Charges of a series that fall in a given "YYYY-MM". */
export function chargesInMonth(series: RecurringSeries, monthKey: string): RecurringCharge[] {
    return series.charges.filter(c => monthKeyOf(c.date) === monthKey);
}
