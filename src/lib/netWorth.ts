import type { WalletSnapshot } from '../types';
import type { RateLookup } from './fxBenchmark';
import { exposureGroup } from './exposure';

// Net worth over time, from the wallets' day-by-day balances a backup carries (an Excel export
// has no balances, so it can't give one). The history lives on this device next to the imported
// operations and is cleared with them.

export type WalletHistory = {
    asOf: string; // ISO time the backup's balances held at
    wallets: { name: string; currency: string; archived: boolean; history: [string, number][] }[];
};

const HISTORY_KEY = 'growmoney:walletHistory';

export function readWalletHistory(): WalletHistory | null {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed.asOf === 'string' && Array.isArray(parsed.wallets) ? parsed : null;
    } catch {
        return null;
    }
}

export function writeWalletHistory(snapshot: WalletSnapshot): void {
    const history: WalletHistory = {
        asOf: snapshot.asOf,
        wallets: snapshot.wallets.map(({ name, currency, archived, history }) => ({ name, currency, archived, history })),
    };
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* storage blocked or full */ }
}

export function clearWalletHistory(): void {
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* storage blocked */ }
}

const DAY_MS = 86_400_000;
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** The days to value: every 7th from `first`, and `last` itself. A week apart keeps the rate
 *  downloads to one a week while still showing each salary and each trip. */
export function sampleDays(first: string, last: string): string[] {
    const days: string[] = [];
    for (let day = first; day < last && days.length < 2000; day = shift(day, 7)) days.push(day);
    days.push(last);
    return days;
}

export interface NetWorthPoint {
    day: string;                     // "YYYY-MM-DD"
    total: number;                   // RUB
    byGroup: Record<string, number>; // RUB per exposure group (lib/exposure)
}

/**
 * Every wallet valued on every given day at that day's rate. A day the rate feed has nothing for
 * takes the nearest earlier day's rate (the first days, the nearest later one), so a gap in the
 * feed doesn't read as money gone. Currencies with no rate on any day are left out and named.
 * Archived wallets are left out all along, as they are from net worth on the Wallets page.
 */
export function netWorthSeries(history: WalletHistory, days: string[], rateOn: RateLookup): { points: NetWorthPoint[]; unvalued: string[] } {
    const wallets = history.wallets.filter(w => !w.archived);
    const codes = [...new Set(wallets.map(w => w.currency))];
    const rates = new Map<string, (number | null)[]>();
    for (const code of codes) {
        const known = days.map(day => rateOn(day, code));
        let carried: number | null = null;
        const filled = known.map(r => (carried = r ?? carried));
        const first = filled.find(r => r !== null) ?? null;
        rates.set(code, filled.map(r => r ?? first));
    }
    const unvalued = codes.filter(code => rates.get(code)!.every(r => r === null));

    const cursor = wallets.map(() => -1);
    const points = days.map((day, i) => {
        const byGroup: Record<string, number> = {};
        let total = 0;
        wallets.forEach((wallet, w) => {
            // Walk this wallet's history up to the day: its balance is the latest one on or before it.
            while (cursor[w] + 1 < wallet.history.length && wallet.history[cursor[w] + 1][0] <= day) cursor[w]++;
            const balance = cursor[w] >= 0 ? wallet.history[cursor[w]][1] : 0;
            const rate = rates.get(wallet.currency)![i];
            if (!balance || rate === null) return;
            const group = exposureGroup(wallet.currency);
            byGroup[group] = (byGroup[group] ?? 0) + balance * rate;
            total += balance * rate;
        });
        return { day, total, byGroup };
    });
    return { points, unvalued };
}
