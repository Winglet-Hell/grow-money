import type { Transaction, Trip } from '../../src/types';
import { getGlobalCategory } from '../../src/lib/categoryGroups';
import { nativeAmountOf, nativeCurrencyOf, round, roundNative } from '../../src/lib/aiExport';
import { dateKeyOf, daysInMonth } from '../../src/lib/periods';
import { exposureGroup, exposureLabel } from '../../src/lib/exposure';
import type { AccountStatus } from '../../src/lib/accountStatus';

// Small pieces every tool shares. Amounts follow the AI export's rules: rubles (the base currency)
// unless a field names another currency, and expenses as positive magnitudes.

export const BASE = 'RUB';

export { round, roundNative };

export const dayOf = (t: Transaction) => dateKeyOf(t.date) ?? t.date;

/** An expense's or income's size in rubles (transfers have no ruble amount). */
export const rubOf = (t: Transaction) => Math.abs(t.amount);

/** What was actually paid or received, in the wallet's own currency. */
export const nativeOf = (t: Transaction) => {
    const currency = nativeCurrencyOf(t, BASE);
    return { amount: roundNative(nativeAmountOf(t), currency), currency };
};

/** The coarse group of an expense category; income and transfers get their own. */
export const groupOf = (t: Transaction) =>
    t.type === 'expense' ? getGlobalCategory(t.category) : t.type === 'income' ? 'Income' : 'Transfers';

/** A transfer's two legs, each in its wallet's currency. A same-currency move has no received leg. */
export const legsOf = (t: Transaction) => {
    const sentCurrency = (t.fromCurrency ?? t.originalCurrency ?? BASE).toUpperCase();
    return {
        from: t.account || 'Unknown',
        to: t.category || 'Unknown',
        sent: roundNative(t.fromAmount ?? Math.abs(t.amount), sentCurrency),
        sentCurrency,
        received: t.toAmount !== undefined && t.toCurrency ? roundNative(t.toAmount, t.toCurrency) : null,
        receivedCurrency: t.toCurrency ?? null,
    };
};

export const pct = (part: number, total: number, digits = 1) => (total ? round((part / total) * 100, digits) : 0);

export const table = (columns: string[], rows: unknown[][]) => ({ columns, rows });

export const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
export const isMonth = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

export const monthBounds = (month: string): [string, string] => [`${month}-01`, `${month}-${String(daysInMonth(month)).padStart(2, '0')}`];

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const weekdayOf = (day: string) => WEEKDAYS[(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7];
/** The Monday that starts a day's week. */
export const weekOf = (day: string) => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
};

/** Names close to what was asked for, to suggest when a filter matched nothing. */
export function similarNames(query: string, names: Iterable<string>, limit = 8): string[] {
    const q = query.trim().toLowerCase();
    const words = q.split(/\s+/).filter(w => w.length >= 3);
    const scored: [string, number][] = [];
    for (const name of new Set(names)) {
        const n = name.toLowerCase();
        const score = n === q ? 0 : n.startsWith(q) || q.startsWith(n) ? 1 : n.includes(q) || q.includes(n) ? 2 : words.some(w => n.includes(w)) ? 3 : -1;
        if (score >= 0) scored.push([name, score]);
    }
    return scored.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([name]) => name);
}

export type TripMatch = { trip: Trip } | { trip: null; candidates: string[] };

/** A trip by its id or name: exact first, then a part of the name. */
export function findTrip(trips: Trip[], query: string): TripMatch {
    const q = query.trim().toLowerCase();
    const byId = trips.find(t => t.id === query.trim());
    if (byId) return { trip: byId };
    const exact = trips.filter(t => t.name.trim().toLowerCase() === q);
    if (exact.length === 1) return { trip: exact[0] };
    const partial = exact.length ? exact : trips.filter(t => t.name.toLowerCase().includes(q) || q.includes(t.name.toLowerCase()));
    if (partial.length === 1) return { trip: partial[0] };
    const candidates = (partial.length ? partial : trips.filter(t => similarNames(query, [t.name]).length)).map(t => `${t.name} (${t.startDate} – ${t.endDate})`);
    return { trip: null, candidates };
}

/** Net worth by currency family, the Wallets page's bar: dollar stablecoins count as dollars. */
export function exposure(accounts: AccountStatus[]) {
    const byGroup = new Map<string, number>();
    let total = 0;
    for (const a of accounts) {
        if (a.archived || !a.rubEquivalent) continue;
        const group = exposureGroup(a.currency);
        byGroup.set(group, (byGroup.get(group) ?? 0) + a.rubEquivalent);
        total += a.rubEquivalent;
    }
    return [...byGroup.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([group, rub]) => ({ group: exposureLabel(group), rub: round(rub), sharePct: pct(rub, total) }));
}
