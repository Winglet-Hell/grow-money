import type { Transaction } from '../../src/types';
import { tagsOf } from '../../src/lib/aiExport';
import { detectUntrackedTrips } from '../../src/lib/tripDetection';
import { tripIcon } from '../../src/lib/tripIcons';
import { budgetStatus, compareWithHome, dailySpending, spentOnAllTrips, tripMetrics, tripYears } from '../../src/lib/tripStats';
import { resolveTrip, suggestTripTransactions, tripStatus } from '../../src/lib/tripUtils';
import type { Context } from '../context';
import { dayOf, findTrip, nativeOf, pct, round, rubOf, table } from './common';

// Trip Analytics: what each trip cost, counted the way the trip pages count it — bookings paid
// ahead included, bills that run at home anyway left out, split payments at their part.

const nullableRound = (n: number | null | undefined) => (n === null || n === undefined ? null : round(n));

function needTrips(ctx: Context) {
    if (ctx.app.trips.length) return;
    throw new Error(ctx.app.signedIn
        ? 'There are no trips in the Grow Money account.'
        : `Trips live in the Grow Money account, which the server can't read: ${ctx.app.problem ?? 'not signed in.'}`);
}

const topCategories = (counted: Transaction[], n: number) => {
    const by = new Map<string, number>();
    for (const t of counted) by.set(t.category, (by.get(t.category) ?? 0) + rubOf(t));
    return [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
};

function listTrips(ctx: Context) {
    const { trips } = ctx.app;
    const txs = ctx.statement.transactions;
    const measured = trips.map(trip => {
        const resolved = resolveTrip(trip, txs);
        return { trip, resolved, m: tripMetrics(trip, trips, txs, resolved) };
    });
    // The columns of the Trip Analytics table, in its order.
    const rows = measured.map(({ trip, resolved, m }) => {
        const budget = budgetStatus(trip, m, ctx.today);
        return [
            trip.name, tripIcon(trip, txs), trip.startDate, trip.endDate, m.days, tripStatus(trip, ctx.today),
            round(m.total), trip.budget ?? null, round(m.bookedAhead), nullableRound(m.onTripPerDay), nullableRound(m.extraVsHome),
            budget ? round(budget.left) : null,
            topCategories(resolved.counted, 3).map(([c, v]) => `${c} ${Math.round(v)}`).join('; ') || null,
        ];
    });
    // Per year, as the page's tiles add them up: a day there over the days covered, the extra over the trips that compare.
    const yearRows = tripYears(trips, txs).map(y => {
        let onTrip = 0;
        let covered = 0;
        let extra = 0;
        let compared = 0;
        for (const { trip, m } of measured) {
            if (!trip.startDate.startsWith(y.year)) continue;
            onTrip += m.onTrip;
            covered += m.daysCovered;
            if (m.extraVsHome !== null) {
                extra += m.extraVsHome;
                compared++;
            }
        }
        return [y.year, y.trips, y.daysAway, round(y.total), covered ? round(onTrip / covered) : null, compared ? round(extra) : null];
    });
    const untracked = detectUntrackedTrips(trips, txs, ctx.app.preferences.hiddenTripSuggestions ?? []);
    return {
        note: [
            'Trip costs in RUB, counted as the Trip Analytics page counts them: everything paid during the trip plus bookings paid ahead and added by hand, minus what was switched off and minus home bills (rent, utilities, phone, subscriptions) that run anyway.',
            'aDayThereRub is what a day there cost — spending from the first day on, bookings paid ahead left out — over the days the statement covers (the page\'s "A day there").',
            'extraVsHomeRub is what the trip cost beyond the same days at home (everyday spending over the 90 days before it, other trips left out); null when there is too little home life to compare with.',
            'A payment shared by two trips (a flight from one into the next) counts once in years and allTripsRub.',
        ].join(' '),
        trips: table(
            ['trip', 'icon', 'startDate', 'endDate', 'days', 'status', 'totalRub', 'budgetRub', 'bookedAheadRub', 'aDayThereRub', 'extraVsHomeRub', 'budgetLeftRub', 'topCategories'],
            rows,
        ),
        years: table(['year', 'trips', 'daysAway', 'totalRub', 'aDayThereRub', 'extraVsHomeRub'], yearRows),
        allTripsRub: round(spentOnAllTrips(trips, txs)),
        ...(untracked.length ? {
            untrackedTrips: {
                note: 'Runs of days spent in another country\'s money that no trip covers, as the app detects them (the user may have dismissed others).',
                ...table(['country', 'flag', 'startDate', 'endDate', 'days', 'currency', 'spentRub'], untracked.map(u => [u.name, u.flag, u.startDate, u.endDate, u.days, u.currency, round(u.spent)])),
            },
        } : {}),
    };
}

function tripDetail(ctx: Context, query: string) {
    const { trips } = ctx.app;
    const txs = ctx.statement.transactions;
    const found = findTrip(trips, query);
    if (!found.trip) {
        throw new Error(`No single trip matches "${query}". ${found.candidates.length ? `Candidates: ${found.candidates.join('; ')}.` : `Trips: ${trips.map(t => t.name).join('; ')}.`}`);
    }
    const trip = found.trip;
    const resolved = resolveTrip(trip, txs);
    const m = tripMetrics(trip, trips, txs, resolved);
    const budget = budgetStatus(trip, m, ctx.today);
    const home = compareWithHome(trip, resolved, m);
    const counted = resolved.entries.filter(e => e.state === 'counted');
    const others = resolved.entries.filter(e => e.state !== 'counted');
    const suggestions = suggestTripTransactions(trip, trips, txs);
    const byCategory = topCategories(resolved.counted, 50);

    return {
        trip: {
            name: trip.name,
            icon: tripIcon(trip, txs),
            startDate: trip.startDate,
            endDate: trip.endDate,
            status: tripStatus(trip, ctx.today),
            days: m.days,
            daysCovered: m.daysCovered,
        },
        note: 'RUB. Counted as the trip page counts it (see get_trips). A split payment shows at this trip\'s part (share). bookedAhead rows were paid before the first day.',
        // The trip page's tiles: Total (and per day), Booked ahead, On the trip (and a day there), vs home.
        cost: {
            totalRub: round(m.total),
            totalPerDayRub: nullableRound(m.perDay),
            bookedAheadRub: round(m.bookedAhead),
            bookedAheadCount: m.bookedAheadCount,
            onTheTripRub: round(m.onTrip),
            aDayThereRub: nullableRound(m.onTripPerDay),
            extraVsHomeRub: nullableRound(m.extraVsHome),
        },
        ...(budget ? {
            budget: {
                budgetRub: round(budget.budget),
                spentRub: round(budget.spent),
                leftRub: round(budget.left),
                usedPct: round(budget.share * 100, 1),
                daysLeft: budget.daysLeft,
                perDayLeftRub: nullableRound(budget.perDayLeft),
                projectedRub: nullableRound(budget.projected),
            },
        } : {}),
        byCategory: table(['category', 'rub', 'sharePct'], byCategory.map(([c, v]) => [c, round(v), pct(v, m.total)])),
        ...(home ? {
            vsHome: {
                note: `Everyday spending per day (travel itself, big planned payments and home bills left out) on the trip and over ${m.home!.days} home days before it.`,
                tripPerDayRub: round(home.tripPerDay),
                homePerDayRub: round(home.homePerDay),
                ...table(['category', 'tripPerDayRub', 'homePerDayRub'], home.rows.map(r => [r.category, round(r.tripPerDay), round(r.homePerDay)])),
            },
        } : {}),
        daily: table(['day', 'rub'], dailySpending(trip, resolved).map(d => [d.day, round(d.amount)])),
        transactions: table(
            ['date', 'category', 'rub', 'share', 'amount', 'currency', 'account', 'tags', 'note', 'bookedAhead'],
            counted.map(e => {
                const n = nativeOf(e.tx);
                return [dayOf(e.tx), e.tx.category, round(rubOf(e.tx) * e.share), e.share, n.amount, n.currency, e.tx.account, tagsOf(e.tx).join(', ') || null, (e.tx.note || '').trim() || null, e.beforeTrip];
            }),
        ),
        ...(others.length ? {
            notCounted: {
                note: '"excluded": switched off by the user; "home-bill": a bill that runs at home anyway, left out unless added by hand.',
                ...table(['date', 'category', 'rub', 'state', 'tags'], others.map(e => [dayOf(e.tx), e.tx.category, round(rubOf(e.tx)), e.state, tagsOf(e.tx).join(', ') || null])),
            },
        } : {}),
        ...(suggestions.length ? {
            maybeMissing: {
                note: 'Travel payments around the trip that no trip counts, as the trip page suggests them (bookings up to two months ahead, anything naming the trip). daysBefore < 0: after the trip.',
                ...table(['date', 'category', 'rub', 'tags', 'note', 'daysBefore', 'namesTrip'], suggestions.slice(0, 15).map(s => [dayOf(s.tx), s.tx.category, round(rubOf(s.tx)), tagsOf(s.tx).join(', ') || null, (s.tx.note || '').trim() || null, s.daysBefore, s.nameMatch])),
            },
        } : {}),
    };
}

export function getTrips(ctx: Context, { trip }: { trip?: string }) {
    needTrips(ctx);
    return trip?.trim() ? tripDetail(ctx, trip) : listTrips(ctx);
}
