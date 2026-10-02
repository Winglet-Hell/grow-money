import type { Transaction, Trip } from '../types';
import { getGlobalCategory, isPlannedPayment } from './categoryGroups';
import { dateKeyOf } from './periods';
import {
    daysBetween, eachDay, indexTransactions, isHomeBill, localDayKey, resolveTrip, shiftDay, tripDayCount, tripStatus,
    type ResolvedTrip, type TripStatus,
} from './tripUtils';

// How a trip compares with ordinary life at home. "Everyday" spending leaves out what doesn't
// happen day to day — travel itself (tickets, hotels, tours, visas), big planned payments
// (rent, gadgets, insurance) and the bills that keep running at home anyway — so a day away
// and a day at home are measured on the same things.
export const isEverydaySpending = (category: string) =>
    getGlobalCategory(category) !== 'Travel' && !isPlannedPayment(category) && !isHomeBill(category);

// Home is measured over the 90 days before a trip, other trips left out; with fewer than two
// weeks of home life on record (the start of the statement) there is nothing fair to compare to.
const HOME_WINDOW_DAYS = 90;
const MIN_HOME_DAYS = 14;

export interface HomeBaseline {
    perDay: number;                  // everyday spending per day at home
    days: number;                    // home days it was measured over
    byCategory: Map<string, number>; // everyday spending per day, by category
}

export interface TripMetrics {
    days: number;            // the trip's length
    daysCovered: number;     // its days the statement reaches (fewer while it is still going)
    total: number;           // everything counted, as a positive amount
    bookedAhead: number;     // counted spending dated before the first day
    bookedAheadCount: number;
    onTrip: number;          // the rest, from the first day on
    perDay: number | null;   // total per covered day
    onTripPerDay: number | null;
    home: HomeBaseline | null;
    extraVsHome: number | null; // what the trip cost beyond the same days at home
}

// Every day any trip covers — home is measured on the days in between.
const awayCache = new WeakMap<Trip[], Set<string>>();
export function daysAway(trips: Trip[]): Set<string> {
    const cached = awayCache.get(trips);
    if (cached) return cached;
    const days = new Set<string>();
    for (const trip of trips) eachDay(trip.startDate, trip.endDate, day => days.add(day));
    awayCache.set(trips, days);
    return days;
}

export function homeBaseline(trip: Trip, trips: Trip[], txs: Transaction[]): HomeBaseline | null {
    const index = indexTransactions(txs);
    if (!index.firstDay || !index.lastDay) return null;
    const away = daysAway(trips);
    let from = shiftDay(trip.startDate, -HOME_WINDOW_DAYS);
    let to = shiftDay(trip.startDate, -1);
    if (from < index.firstDay) from = index.firstDay;
    if (to > index.lastDay) to = index.lastDay; // a trip still ahead: home up to the last import
    let days = 0;
    let total = 0;
    const byCategory = new Map<string, number>();
    eachDay(from, to, day => {
        if (away.has(day)) return;
        days++;
        for (const t of index.expensesByDay.get(day) ?? []) {
            if (!isEverydaySpending(t.category)) continue;
            const amount = Math.abs(t.amount);
            total += amount;
            byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + amount);
        }
    });
    if (days < MIN_HOME_DAYS) return null;
    for (const [category, amount] of byCategory) byCategory.set(category, amount / days);
    return { perDay: total / days, days, byCategory };
}

export function tripMetrics(trip: Trip, trips: Trip[], txs: Transaction[], resolved: ResolvedTrip = resolveTrip(trip, txs)): TripMetrics {
    const index = indexTransactions(txs);
    const days = tripDayCount(trip);
    // A trip in progress (or a statement that stops early) is judged on the days on record.
    const lastCovered = index.lastDay && index.lastDay < trip.endDate ? index.lastDay : trip.endDate;
    const daysCovered = lastCovered >= trip.startDate ? Math.min(days, daysBetween(trip.startDate, lastCovered) + 1) : 0;

    let total = 0;
    let bookedAhead = 0;
    let bookedAheadCount = 0;
    for (const t of resolved.counted) {
        const amount = Math.abs(t.amount);
        total += amount;
        if ((dateKeyOf(t.date) ?? '') < trip.startDate) {
            bookedAhead += amount;
            bookedAheadCount++;
        }
    }
    const onTrip = total - bookedAhead;
    const home = homeBaseline(trip, trips, txs);
    return {
        days,
        daysCovered,
        total,
        bookedAhead,
        bookedAheadCount,
        onTrip,
        perDay: daysCovered > 0 ? total / daysCovered : null,
        onTripPerDay: daysCovered > 0 ? onTrip / daysCovered : null,
        home,
        extraVsHome: home && daysCovered > 0 ? total - home.perDay * daysCovered : null,
    };
}

export interface HomeComparisonRow {
    category: string;
    tripPerDay: number;
    homePerDay: number;
}

export interface HomeComparison {
    rows: HomeComparisonRow[];
    tripPerDay: number; // everyday spending per day on the trip
    homePerDay: number;
}

/** Everyday spending per day on the trip next to the same categories at home. */
export function compareWithHome(trip: Trip, resolved: ResolvedTrip, metrics: TripMetrics): HomeComparison | null {
    if (!metrics.home || metrics.daysCovered === 0) return null;
    const byCategory = new Map<string, number>();
    let total = 0;
    for (const t of resolved.counted) {
        if ((dateKeyOf(t.date) ?? '') < trip.startDate || !isEverydaySpending(t.category)) continue;
        const amount = Math.abs(t.amount);
        total += amount;
        byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + amount);
    }
    const categories = new Set([...byCategory.keys(), ...metrics.home.byCategory.keys()]);
    const rows = [...categories]
        .map(category => ({
            category,
            tripPerDay: (byCategory.get(category) ?? 0) / metrics.daysCovered,
            homePerDay: metrics.home!.byCategory.get(category) ?? 0,
        }))
        .filter(r => r.tripPerDay >= 5 || r.homePerDay >= 5)
        .sort((a, b) => Math.max(b.tripPerDay, b.homePerDay) - Math.max(a.tripPerDay, a.homePerDay));
    return { rows, tripPerDay: total / metrics.daysCovered, homePerDay: metrics.home.perDay };
}

/** Counted spending on each day of the trip (bookings made before it are not on a day of it). */
export function dailySpending(trip: Trip, resolved: ResolvedTrip): { day: string; amount: number }[] {
    const byDay = new Map<string, number>();
    eachDay(trip.startDate, trip.endDate, day => byDay.set(day, 0));
    for (const t of resolved.counted) {
        const day = dateKeyOf(t.date);
        if (day && byDay.has(day)) byDay.set(day, byDay.get(day)! + Math.abs(t.amount));
    }
    return [...byDay.entries()].map(([day, amount]) => ({ day, amount }));
}

export interface TripYear {
    year: string;
    trips: number;
    daysAway: number; // calendar days on the road — two trips sharing a day count it once
    total: number;    // a payment two trips share counts once
}

/** Trips grouped by the year they started in, newest year first. */
export function tripYears(trips: Trip[], txs: Transaction[]): TripYear[] {
    const byYear = new Map<string, { trips: number; days: Set<string>; amounts: Map<string, number> }>();
    for (const trip of trips) {
        const year = trip.startDate.slice(0, 4);
        const entry = byYear.get(year) ?? { trips: 0, days: new Set<string>(), amounts: new Map<string, number>() };
        entry.trips++;
        eachDay(trip.startDate, trip.endDate, day => entry.days.add(day));
        for (const t of resolveTrip(trip, txs).counted) entry.amounts.set(t.id, Math.abs(t.amount));
        byYear.set(year, entry);
    }
    return [...byYear.entries()]
        .map(([year, e]) => ({ year, trips: e.trips, daysAway: e.days.size, total: [...e.amounts.values()].reduce((s, a) => s + a, 0) }))
        .sort((a, b) => b.year.localeCompare(a.year));
}

export interface BudgetStatus {
    budget: number;
    spent: number;            // everything counted so far, bookings included
    left: number;             // negative once over
    share: number;            // spent / budget
    status: TripStatus;
    daysLeft: number;         // today and the days after it, for a trip still ahead or under way
    perDayLeft: number | null; // what each remaining day may cost
    projected: number | null; // where a trip under way lands at its pace so far
}

/** The trip's spending against its budget, or null without one. */
export function budgetStatus(trip: Trip, metrics: TripMetrics, today = localDayKey()): BudgetStatus | null {
    if (!trip.budget || trip.budget <= 0) return null;
    const status = tripStatus(trip, today);
    const spent = metrics.total;
    const left = trip.budget - spent;
    const daysLeft = status === 'upcoming' ? metrics.days : status === 'ongoing' ? daysBetween(today, trip.endDate) + 1 : 0;
    // Under way: the bookings plus every day at the average of the days on record.
    const projected = status === 'ongoing' && metrics.onTripPerDay !== null
        ? metrics.bookedAhead + metrics.onTripPerDay * metrics.days
        : null;
    return {
        budget: trip.budget,
        spent,
        left,
        share: spent / trip.budget,
        status,
        daysLeft,
        perDayLeft: daysLeft > 0 && left > 0 ? left / daysLeft : null,
        projected,
    };
}
