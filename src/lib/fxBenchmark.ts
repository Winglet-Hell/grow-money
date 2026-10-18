// Reference ("market") rates for the day of each currency exchange, and the arithmetic
// that turns them into "how much the exchanger kept". Shared by the Currency Rates page
// and the AI export so both quote exactly the same figures with the same sign.
//
// The method: value both legs of a conversion in RUB at that day's reference rates.
// What was sent minus what came back is the spread/commission — positive when the
// exchanger kept it, negative when the user beat the market.
import type { Transaction } from '../types';

// currency-api publishes one snapshot per calendar day, from this date onwards.
export const FIRST_SNAPSHOT_DATE = '2024-03-02';

/** RUB per 1 unit of CODE on a given day; null = the feed had no rate for that code. */
export type DailyRates = Record<string, number | null>;

/** Per-day snapshots plus the state of fetching them — what useHistoricalRates returns. */
export interface ReferenceRates {
    snapshots: Record<string, DailyRates>; // date ("YYYY-MM-DD") → code → RUB per unit
    isLoading: boolean;                    // some requested dates are still being fetched
    missingDates: string[];                // requested dates with no snapshot (too old or not published yet)
}

const mirrorsFor = (date: string) => [
    `https://${date}.currency-api.pages.dev/v1/currencies/rub.json`,
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/rub.json`,
];

/** The feed's snapshot of one day as RUB per 1 unit of every code it lists, or null when no mirror has it. */
export async function fetchDailyRates(date: string): Promise<Record<string, number> | null> {
    for (const url of mirrorsFor(date)) {
        try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const data = await res.json();
            if (!data || !data.rub) continue;

            // data.rub[code] = units of CODE per 1 RUB → invert to RUB per CODE.
            const next: Record<string, number> = {};
            for (const [code, perRub] of Object.entries(data.rub as Record<string, number>)) {
                if (typeof perRub === 'number' && perRub > 0) {
                    next[code.toUpperCase()] = 1 / perRub;
                }
            }
            // Stablecoins occasionally missing — fall back to USD parity.
            if (next.USD && !next.USDT) next.USDT = next.USD;
            if (next.USD && !next.USDC) next.USDC = next.USD;
            return next;
        } catch {
            // Try the next mirror.
        }
    }
    return null;
}

/** RUB per 1 unit of `code` on `date`, or null when unknown. */
export type RateLookup = (date: string, code: string) => number | null;

/** Today's rates, used for days the feed has not published a snapshot for yet. */
export interface LiveFallback {
    rates: Record<string, number>; // RUB per 1 unit of CODE
    date: string | null;           // snapshot date of `rates`; null = assume today
}

export function makeRateLookup(snapshots: Record<string, DailyRates>, live?: LiveFallback): RateLookup {
    const liveFrom = live ? (live.date ?? new Date().toISOString().slice(0, 10)) : null;
    return (date, code) => {
        if (code === 'RUB') return 1;
        const snapshot = snapshots[date] ?? (liveFrom && date >= liveFrom ? live!.rates : undefined);
        const r = snapshot?.[code];
        return typeof r === 'number' && r > 0 ? r : null;
    };
}

/** A transfer whose two legs are in different currencies — a real conversion. */
export const isCrossCurrencyTransfer = (t: Transaction): boolean =>
    t.type === 'transfer' &&
    !!t.fromCurrency && !!t.toCurrency && t.fromCurrency !== t.toCurrency &&
    (t.fromAmount ?? 0) > 0 && (t.toAmount ?? 0) > 0;

/** The dates and currency codes the reference rates must cover for these transactions. */
export function referenceCoverage(transactions: Transaction[]): { dates: string[]; codes: string[] } {
    const dates = new Set<string>();
    const codes = new Set<string>();
    for (const t of transactions) {
        if (!isCrossCurrencyTransfer(t)) continue;
        dates.add(t.date);
        codes.add(t.fromCurrency!);
        codes.add(t.toCurrency!);
    }
    return { dates: [...dates].sort(), codes: [...codes].sort() };
}

// A real exchange practically never deviates this far from the market: beyond it the
// row is almost certainly a data-entry slip (missing thousands, wrong currency on a leg).
export const IMPLAUSIBLE_CUT_PCT = 30;
export const isImplausibleCut = (vsMarketPct: number) => Math.abs(vsMarketPct) * 100 > IMPLAUSIBLE_CUT_PCT;

export interface ConversionBenchmark {
    rateFrom: number;     // RUB per unit of the sent currency, that day
    rateTo: number;       // RUB per unit of the received currency, that day
    sentRub: number;      // value sent, at that day's rate
    receivedRub: number;  // value received, at that day's rate
    lossRub: number;      // sentRub − receivedRub; > 0 = kept by the exchanger
    vsMarketPct: number;  // (receivedRub − sentRub) / sentRub, as a fraction; < 0 = the exchanger's cut
}

export function benchmarkConversion(
    date: string,
    fromAmount: number,
    fromCurrency: string,
    toAmount: number,
    toCurrency: string,
    rateOn: RateLookup,
): ConversionBenchmark | null {
    const rateFrom = rateOn(date, fromCurrency);
    const rateTo = rateOn(date, toCurrency);
    if (!rateFrom || !rateTo) return null;

    const sentRub = fromAmount * rateFrom;
    const receivedRub = toAmount * rateTo;
    if (sentRub <= 0) return null;
    const lossRub = sentRub - receivedRub;
    return { rateFrom, rateTo, sentRub, receivedRub, lossRub, vsMarketPct: -lossRub / sentRub };
}
