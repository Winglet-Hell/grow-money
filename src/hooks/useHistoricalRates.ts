import { useEffect, useMemo, useState } from 'react';
import { FIRST_SNAPSHOT_DATE, type DailyRates, type ReferenceRates } from '../lib/fxBenchmark';

// Daily reference rates from the same currency-api feed that powers useLiveRates, one
// snapshot per calendar day as "RUB per 1 unit of CODE". Snapshots exist from
// FIRST_SNAPSHOT_DATE onwards and never change once published, so each date is cached
// for good in localStorage — but only the codes that were asked for, to keep the store small.

const STORAGE_PREFIX = 'fxSnapshot:v1:';
const MAX_PARALLEL = 6;

const memory = new Map<string, DailyRates>();
// Dates the feed had nothing for this session (e.g. today's file not published yet).
// Not persisted, so they are retried on the next visit.
const unavailable = new Set<string>();

const mirrorsFor = (date: string) => [
    `https://${date}.currency-api.pages.dev/v1/currencies/rub.json`,
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/rub.json`,
];

function readCache(date: string): DailyRates | undefined {
    const hit = memory.get(date);
    if (hit) return hit;
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + date);
        if (!raw) return undefined;
        const parsed = JSON.parse(raw) as DailyRates;
        memory.set(date, parsed);
        return parsed;
    } catch {
        return undefined;
    }
}

function writeCache(date: string, rates: DailyRates) {
    memory.set(date, rates);
    try {
        localStorage.setItem(STORAGE_PREFIX + date, JSON.stringify(rates));
    } catch {
        // Quota exceeded or storage blocked — the in-memory copy still serves this session.
    }
}

async function fetchSnapshot(date: string): Promise<Record<string, number> | null> {
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

const hasAll = (snapshot: DailyRates | undefined, codes: string[]) =>
    !!snapshot && codes.every(code => code in snapshot);

/**
 * Reference rates for each of the given dates, restricted to the given currency codes.
 * Cached dates resolve synchronously; the rest are fetched a few at a time.
 */
export function useHistoricalRates(dates: string[], codes: string[]): ReferenceRates {
    // Arrays are rebuilt by callers on every render; key on their contents instead.
    const datesKey = dates.join(',');
    const codesKey = codes.join(',');
    const wanted = useMemo(() => (datesKey ? datesKey.split(',') : []), [datesKey]);
    const needed = useMemo(() => (codesKey ? codesKey.split(',') : []), [codesKey]);

    // Fetches that landed while mounted. Cached dates are read straight from the cache;
    // these two only exist so that a completed fetch re-renders the caller.
    const [loaded, setLoaded] = useState<Record<string, DailyRates>>({});
    const [failed, setFailed] = useState<Set<string>>(() => new Set());

    useEffect(() => {
        const queue = wanted.filter(date =>
            date >= FIRST_SNAPSHOT_DATE && !unavailable.has(date) && !hasAll(readCache(date), needed)
        );
        if (queue.length === 0) return;

        let cancelled = false;
        const worker = async () => {
            while (queue.length > 0 && !cancelled) {
                const date = queue.shift()!;
                const fresh = await fetchSnapshot(date);
                // A snapshot is valid regardless of who asked for it — cache it even when
                // this effect has been superseded, and only skip the re-render.
                if (fresh) {
                    // Keep codes cached by earlier requests; record a null for codes the
                    // feed lacks so they are not re-fetched every time.
                    const merged: DailyRates = { ...(readCache(date) ?? {}) };
                    for (const code of needed) merged[code] = fresh[code] ?? null;
                    writeCache(date, merged);
                    if (!cancelled) setLoaded(prev => ({ ...prev, [date]: merged }));
                } else {
                    unavailable.add(date);
                    if (!cancelled) setFailed(prev => new Set(prev).add(date));
                }
            }
        };
        Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, queue.length) }, worker))
            .catch(err => console.error('Failed to fetch historical rates:', err));

        return () => { cancelled = true; };
    }, [wanted, needed]);

    return useMemo(() => {
        const snapshots: Record<string, DailyRates> = {};
        const missingDates: string[] = [];
        let pending = 0;
        for (const date of wanted) {
            if (date < FIRST_SNAPSHOT_DATE || unavailable.has(date) || failed.has(date)) {
                missingDates.push(date);
                continue;
            }
            const cached = loaded[date] ?? readCache(date);
            if (cached) snapshots[date] = cached;
            if (!hasAll(cached, needed)) pending++;
        }
        return { snapshots, isLoading: pending > 0, missingDates };
    }, [wanted, needed, loaded, failed]);
}
