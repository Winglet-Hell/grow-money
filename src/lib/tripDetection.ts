import type { Transaction, Trip } from '../types';
import { dateKeyOf } from './periods';
import { daysBetween, eachDay } from './tripUtils';
import { daysAway } from './tripStats';
import { CURRENCY_COUNTRY, flagOf, homeCountry } from './tripIcons';

// Trips the statement shows but the trip list doesn't: runs of days with spending in another
// country's money — cash yen, a GoPay wallet in rupiah — that no trip covers yet. Dollars and
// USDT pay for things everywhere, so trips paid only by card can't be told apart this way, and
// neither can trips inside the home country.

const MAX_GAP_DAYS = 3; // card-only days in the middle of a trip don't split it in two
const MIN_DAYS = 2;     // one payment in a foreign currency (a subscription billed abroad) isn't a trip

export interface DetectedTrip {
    key: string;       // country:first:last — what dismissing one remembers
    country: string;
    name: string;      // "Japan"
    flag: string;
    startDate: string;
    endDate: string;
    days: number;
    currency: string;  // the local money it was spent in
    spent: number;     // in rubles
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const countryName = (code: string) => (code === 'EU' ? 'Europe' : regionNames.of(code) ?? code);

export function detectUntrackedTrips(trips: Trip[], txs: Transaction[], hidden: readonly string[] = []): DetectedTrip[] {
    const home = homeCountry(txs);
    const away = daysAway(trips);
    const byCountry = new Map<string, Map<string, { spent: number; currencies: Map<string, number> }>>();
    for (const t of txs) {
        if (t.type !== 'expense' || !t.originalCurrency) continue;
        const currency = t.originalCurrency.toUpperCase();
        const country = CURRENCY_COUNTRY[currency];
        const day = dateKeyOf(t.date);
        if (!country || country === home || !day) continue;
        const days = byCountry.get(country) ?? new Map();
        byCountry.set(country, days);
        const entry = days.get(day) ?? { spent: 0, currencies: new Map<string, number>() };
        entry.spent += Math.abs(t.amount);
        entry.currencies.set(currency, (entry.currencies.get(currency) ?? 0) + 1);
        days.set(day, entry);
    }

    const found: DetectedTrip[] = [];
    for (const [country, days] of byCountry) {
        const add = (run: string[]) => {
            if (run.length < MIN_DAYS) return;
            const startDate = run[0];
            const endDate = run[run.length - 1];
            let covered = false;
            eachDay(startDate, endDate, day => { if (away.has(day)) covered = true; });
            const key = `${country}:${startDate}:${endDate}`;
            if (covered || hidden.includes(key)) return;
            const currencies = new Map<string, number>();
            let spent = 0;
            for (const day of run) {
                const entry = days.get(day)!;
                spent += entry.spent;
                entry.currencies.forEach((n, c) => currencies.set(c, (currencies.get(c) ?? 0) + n));
            }
            found.push({
                key,
                country,
                name: countryName(country),
                flag: flagOf(country),
                startDate,
                endDate,
                days: daysBetween(startDate, endDate) + 1,
                currency: [...currencies.entries()].sort((a, b) => b[1] - a[1])[0][0],
                spent,
            });
        };
        let run: string[] = [];
        for (const day of [...days.keys()].sort()) {
            if (run.length && daysBetween(run[run.length - 1], day) > MAX_GAP_DAYS + 1) {
                add(run);
                run = [];
            }
            run.push(day);
        }
        add(run);
    }
    return found.sort((a, b) => b.startDate.localeCompare(a.startDate));
}
