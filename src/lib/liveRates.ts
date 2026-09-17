import { registerRateCodes } from './currencies';

// One fetch of today's rates per session, shared by every page. Before this each page
// (Dashboard table, Wallets, Goals, AI Export, Currency Rates) downloaded the same file
// on mount, and two pages could value the same balance at rates minutes apart.

export interface LiveRatesSnapshot {
    rates: Record<string, number>; // RUB per 1 unit of CODE, upper-case codes
    date: string | null;           // API snapshot date, "YYYY-MM-DD"
    fetchedAt: number;             // Date.now() when downloaded
}

const RATES_URL = 'https://latest.currency-api.pages.dev/v1/currencies/rub.json';
const FRESH_FOR_MS = 30 * 60 * 1000; // the feed itself updates once a day

let snapshot: LiveRatesSnapshot | null = null;
let inflight: Promise<LiveRatesSnapshot | null> | null = null;

/** The cached snapshot when it is still fresh, otherwise null (no network). */
export function getCachedLiveRates(): LiveRatesSnapshot | null {
    return snapshot && Date.now() - snapshot.fetchedAt < FRESH_FOR_MS ? snapshot : null;
}

/**
 * Today's rates: served from memory while fresh, otherwise downloaded once — concurrent
 * callers share the same request. Resolves null when the feed is unreachable.
 */
export function fetchLiveRates(force = false): Promise<LiveRatesSnapshot | null> {
    const cached = force ? null : getCachedLiveRates();
    if (cached) return Promise.resolve(cached);
    if (inflight) return inflight;

    inflight = (async () => {
        try {
            const res = await fetch(RATES_URL);
            const data = await res.json();
            if (!data || !data.rub) return null;

            // data.rub[code] = units of CODE per 1 RUB → invert to RUB per CODE.
            const rates: Record<string, number> = {};
            for (const [code, perRub] of Object.entries(data.rub as Record<string, number>)) {
                if (typeof perRub === 'number' && perRub > 0) rates[code.toUpperCase()] = 1 / perRub;
            }
            // Stablecoins occasionally missing — fall back to USD parity.
            if (rates.USD && !rates.USDT) rates.USDT = rates.USD;
            if (rates.USD && !rates.USDC) rates.USDC = rates.USD;

            // Let the shared catalogue know which codes can actually be valued.
            registerRateCodes(Object.keys(rates));

            snapshot = { rates, date: typeof data.date === 'string' ? data.date : null, fetchedAt: Date.now() };
            return snapshot;
        } catch (err) {
            console.error('Failed to fetch live rates:', err);
            return null;
        } finally {
            inflight = null;
        }
    })();
    return inflight;
}
