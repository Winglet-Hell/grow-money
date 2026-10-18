import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchLiveRates } from '../src/lib/liveRates';
import { FIRST_SNAPSHOT_DATE, fetchDailyRates, type DailyRates, type ReferenceRates } from '../src/lib/fxBenchmark';
import { todayKey } from '../src/lib/milestones';
import { shiftDay } from '../src/lib/tripUtils';
import { RATES_DIR } from './paths';

// Market rates from currency-api, the feed and mirrors the app uses, as RUB per 1 unit of a code.
// Today's come from the app's own fetch (kept half an hour). A day's snapshot never changes once
// published, so each one is kept on disk for good, whole, whatever codes were asked for.

export interface LiveRates {
    rates: Record<string, number>;
    date: string | null; // the snapshot's day
    isLive: boolean;     // false: nothing could be fetched, wallets fall back to the app's built-in rates
}

const MAX_PARALLEL = 8;
const RETRY_MISSING_MS = 30 * 60_000; // a day not published yet (today, mostly) is asked for again later

const memory = new Map<string, Record<string, number>>();
const pending = new Map<string, Promise<Record<string, number> | null>>();
const missingSince = new Map<string, number>();

let active = 0;
const queue: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= MAX_PARALLEL) await new Promise<void>(resolve => queue.push(resolve));
    active++;
    try {
        return await fn();
    } finally {
        active--;
        queue.shift()?.();
    }
}

const fileOf = (date: string) => path.join(RATES_DIR, `${date}.json`);

async function readDisk(date: string): Promise<Record<string, number> | null> {
    try {
        const parsed = JSON.parse(await fs.readFile(fileOf(date), 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

async function writeDisk(date: string, rates: Record<string, number>): Promise<void> {
    await fs.mkdir(RATES_DIR, { recursive: true });
    const tmp = `${fileOf(date)}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(rates));
    await fs.rename(tmp, fileOf(date));
}

const isMissing = (date: string) => {
    const since = missingSince.get(date);
    return since !== undefined && Date.now() - since < RETRY_MISSING_MS;
};

function snapshotOn(date: string): Promise<Record<string, number> | null> {
    const known = memory.get(date);
    if (known) return Promise.resolve(known);
    if (isMissing(date)) return Promise.resolve(null);
    let promise = pending.get(date);
    if (!promise) {
        promise = (async () => {
            const saved = await readDisk(date);
            if (saved) {
                memory.set(date, saved);
                return saved;
            }
            const fresh = await limited(() => fetchDailyRates(date));
            if (!fresh) {
                missingSince.set(date, Date.now());
                return null;
            }
            memory.set(date, fresh);
            missingSince.delete(date);
            await writeDisk(date, fresh).catch(() => undefined);
            return fresh;
        })().finally(() => pending.delete(date));
        pending.set(date, promise);
    }
    return promise;
}

/**
 * The day-by-day reference rates for these dates, as useHistoricalRates gives them to the app.
 * Waits up to `waitMs` for days not yet on disk; the rest keep downloading for the next call and
 * are reported through `isLoading`.
 */
export async function referenceRates(dates: string[], waitMs = 25_000): Promise<ReferenceRates> {
    const wanted = [...new Set(dates)].filter(d => d >= FIRST_SNAPSHOT_DATE);
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
        Promise.all(wanted.map(snapshotOn)),
        new Promise<void>(resolve => { timer = setTimeout(resolve, waitMs); }),
    ]);
    clearTimeout(timer);

    const snapshots: Record<string, DailyRates> = {};
    const missingDates: string[] = [];
    let loading = 0;
    for (const date of new Set(dates)) {
        const snapshot = memory.get(date);
        if (snapshot) snapshots[date] = snapshot;
        else if (date < FIRST_SNAPSHOT_DATE || isMissing(date)) missingDates.push(date);
        else loading++;
    }
    return { snapshots, isLoading: loading > 0, missingDates };
}

/** Today's rates: the app's fetch, else the newest day snapshot the mirrors have. */
export async function liveRates(): Promise<LiveRates> {
    const live = await fetchLiveRates();
    if (live) return { rates: live.rates, date: live.date, isLive: true };
    const today = todayKey();
    for (const day of [today, shiftDay(today, -1), shiftDay(today, -2)]) {
        const snapshot = await snapshotOn(day);
        if (snapshot) return { rates: snapshot, date: day, isLive: true };
    }
    return { rates: {}, date: null, isLive: false };
}
