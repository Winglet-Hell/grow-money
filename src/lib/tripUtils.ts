import type { Transaction, Trip, TransactionSnapshot } from '../types';
import { getGlobalCategory, isHomeBill, isTravelBooking, isTravelSim } from './categoryGroups';
import { dateKeyOf } from './periods';
import { contentId, idsOf } from './transactionId';
import { formatTags } from './utils';

// A trip is a date range plus two hand-kept lists: transactions switched off inside the range
// (excluded) and transactions brought in from outside it (additional — flights and hotels paid
// weeks ahead). A backup's ids survive edits in the source app, but an Excel export's are content
// hashes: editing a note there gives a transaction a new id. Every listed id therefore also keeps
// a snapshot to find it again, and a backup row still answers to its hash (its exportId).

export type TripLists = Pick<Trip, 'excludedTransactionIds' | 'additionalTransactionIds' | 'transactionSnapshots' | 'transactionShares'>;

export const createSnapshot = (t: Transaction): TransactionSnapshot => ({
    date: t.date,
    amount: t.amount,
    category: t.category,
    note: t.note || '',
    originalCurrency: t.originalCurrency
});

const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.005;

// Identical rows — two metro rides at one fare on one day — share a content hash, and the parser
// numbers the repeats: "k3x9", "k3x9_1", "k3x9_2". The number says which of the twins an id meant.
const occurrenceOf = (id: string) => Number(/_(\d+)$/.exec(id)?.[1] ?? 0);

// Rows alike in everything the export carries; any one of them stands for another.
const areTwins = (rows: Transaction[]) => rows.every(t =>
    t.category === rows[0].category &&
    t.account === rows[0].account &&
    (t.note || '') === (rows[0].note || '') &&
    t.originalAmount === rows[0].originalAmount &&
    formatTags(t.tags) === formatTags(rows[0].tags)
);

// "Market delivery" → {mark, deli}: enough to see that "Grocery delivery" took over from it.
const stemsOf = (name: string) =>
    new Set(name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4).map(w => w.slice(0, 4)));

/** The transaction a stored snapshot points at; `id` is the id it was stored under. */
export const findTransactionWithSnapshot = (snapshot: TransactionSnapshot, candidates: Transaction[], id = ''): Transaction | undefined => {
    const nth = (rows: Transaction[]) => rows[Math.min(occurrenceOf(id), rows.length - 1)];
    const exact = candidates.filter(t =>
        t.date === snapshot.date &&
        t.amount === snapshot.amount &&
        t.category === snapshot.category &&
        (t.note || '') === snapshot.note &&
        (t.originalCurrency || '') === (snapshot.originalCurrency || '')
    );
    if (exact.length > 0) return nth(exact);
    // A note or category edited in the source app breaks the exact match — that is how an
    // excluded phone purchase slid back into a trip, and how renaming the categories would have
    // let go of hundreds. Given the category it had then, the row the id was made from hashes to
    // that id again; failing that, given its old note as well (the note goes back only second:
    // it is what tells the train there from the train back). Rows that differ only in category
    // all hash back alike, though; then the one whose category kept a word of the old name
    // ("Transport" → "Local transport") is the heir, or none is.
    const base = id.replace(/_\d+$/, '');
    const oldStems = stemsOf(snapshot.category);
    const hashesBack = (withNote: boolean) => candidates.filter(t =>
        contentId({ ...t, category: snapshot.category, note: withNote ? snapshot.note : t.note || '' }) === base);
    for (const withNote of [false, true]) {
        const rebuilt = base ? hashesBack(withNote) : [];
        const heirs = rebuilt.filter(t => [...stemsOf(t.category)].some(stem => oldStems.has(stem)));
        for (const rows of [rebuilt, heirs]) {
            if (rows.length > 0 && rows.every(t => t.category === rows[0].category)) return nth(rows);
        }
    }
    // Other edits (a renamed wallet) change the id beyond that. The day, the amount and the
    // currency survive them, so trust those when exactly one transaction fits; when several do,
    // the note tells them apart, and rows alike in everything are twins.
    const loose = candidates.filter(t =>
        t.date === snapshot.date &&
        sameAmount(t.amount, snapshot.amount) &&
        (t.originalCurrency || '') === (snapshot.originalCurrency || '')
    );
    const sameNote = loose.filter(t => (t.note || '') === snapshot.note);
    for (const rows of [loose, sameNote]) {
        if (rows.length === 1) return rows[0];
        if (rows.length > 1 && areTwins(rows)) return nth(rows);
    }
    return undefined;
};

// ------------------------------------------------------------------ days

const DAY_MS = 86_400_000;
const isDayKey = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && !isNaN(Date.parse(day));

/** "YYYY-MM-DD" n days after (or before, when negative) a day. */
export const shiftDay = (day: string, n: number) => new Date(Date.parse(day) + n * DAY_MS).toISOString().slice(0, 10);

/** Whole days from one day to another (0 for the same day). */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/** Calls fn for every day from `from` to `to`, both included. */
export function eachDay(from: string, to: string, fn: (day: string) => void): void {
    if (!isDayKey(from) || !isDayKey(to)) return;
    for (let day = from, guard = 0; day <= to && guard < 3700; day = shiftDay(day, 1), guard++) fn(day);
}

/** A trip's length in days, both ends included. */
export const tripDayCount = (trip: Pick<Trip, 'startDate' | 'endDate'>) =>
    isDayKey(trip.startDate) && isDayKey(trip.endDate) ? Math.max(1, daysBetween(trip.startDate, trip.endDate) + 1) : 1;

/** Today in the viewer's own calendar — what "now" means for a trip in progress. */
export function localDayKey(d = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type TripStatus = 'upcoming' | 'ongoing' | 'past';

export function tripStatus(trip: Pick<Trip, 'startDate' | 'endDate'>, today = localDayKey()): TripStatus {
    if (trip.startDate > today) return 'upcoming';
    return trip.endDate >= today ? 'ongoing' : 'past';
}

// ------------------------------------------------------------------ index

export interface TxIndex {
    byId: Map<string, Transaction>;            // by every id a row answers to (see idsOf)
    byDate: Map<string, Transaction[]>;        // keyed by the raw date, as snapshots store it
    expensesByDay: Map<string, Transaction[]>; // keyed by "YYYY-MM-DD"
    firstDay: string | null;                   // the span the statement covers
    lastDay: string | null;
}

// Every page resolves every trip against the same transaction array; index it once.
const indexCache = new WeakMap<Transaction[], TxIndex>();

export function indexTransactions(txs: Transaction[]): TxIndex {
    const cached = indexCache.get(txs);
    if (cached) return cached;
    const byId = new Map<string, Transaction>();
    const byDate = new Map<string, Transaction[]>();
    const expensesByDay = new Map<string, Transaction[]>();
    let firstDay: string | null = null;
    let lastDay: string | null = null;
    for (const t of txs) {
        for (const id of idsOf(t)) byId.set(id, t);
        const sameDate = byDate.get(t.date);
        if (sameDate) sameDate.push(t); else byDate.set(t.date, [t]);
        const day = dateKeyOf(t.date);
        if (!day) continue;
        if (!firstDay || day < firstDay) firstDay = day;
        if (!lastDay || day > lastDay) lastDay = day;
        if (t.type !== 'expense') continue;
        const sameDay = expensesByDay.get(day);
        if (sameDay) sameDay.push(t); else expensesByDay.set(day, [t]);
    }
    const index = { byId, byDate, expensesByDay, firstDay, lastDay };
    indexCache.set(txs, index);
    return index;
}

// ------------------------------------------------------------- membership

export type TripEntryState = 'counted' | 'excluded' | 'home-bill';

export interface TripEntry {
    tx: Transaction;
    state: TripEntryState;
    added: boolean;      // brought in by hand
    beforeTrip: boolean; // paid before the first day — a booking
    share: number;       // the part of the payment this trip counts: 1, or less when it's split
}

export interface ResolvedTrip {
    entries: TripEntry[];     // everything the trip lists, newest first
    // What the trip's numbers are made of. A payment split between trips appears here at this
    // trip's part of it (amount scaled down), so every sum over `counted` is already right.
    counted: Transaction[];
    excludedIds: Set<string>; // switched off, or dismissed as a suggestion
}

// A payment at the part a trip counts of it — the same object when it counts whole.
const atShare = (tx: Transaction, share: number): Transaction =>
    share >= 1 ? tx : {
        ...tx,
        amount: tx.amount * share,
        originalAmount: tx.originalAmount !== undefined ? tx.originalAmount * share : undefined,
    };

const resolverFor = (trip: Trip, index: TxIndex) => {
    const snapshots = trip.transactionSnapshots || {};
    return (id: string): Transaction | undefined => {
        const direct = index.byId.get(id);
        if (direct) return direct;
        const snapshot = snapshots[id];
        return snapshot ? findTransactionWithSnapshot(snapshot, index.byDate.get(snapshot.date) ?? [], id) : undefined;
    };
};

const byNewest = (a: TripEntry, b: TripEntry) =>
    b.tx.date.localeCompare(a.tx.date) || (a.tx.index ?? 0) - (b.tx.index ?? 0);

export function resolveTrip(trip: Trip, txs: Transaction[]): ResolvedTrip {
    const index = indexTransactions(txs);
    const resolve = resolverFor(trip, index);
    const excludedIds = new Set<string>();
    for (const id of trip.excludedTransactionIds || []) {
        const tx = resolve(id);
        if (tx) excludedIds.add(tx.id);
    }
    const added = new Map<string, Transaction>();
    for (const id of trip.additionalTransactionIds || []) {
        const tx = resolve(id);
        if (tx) added.set(tx.id, tx);
    }
    const shares = new Map<string, number>();
    for (const [id, share] of Object.entries(trip.transactionShares || {})) {
        const tx = resolve(id);
        if (tx && share > 0 && share < 1) shares.set(tx.id, share);
    }

    const entries: TripEntry[] = [];
    const listed = new Set<string>();
    eachDay(trip.startDate, trip.endDate, day => {
        for (const tx of index.expensesByDay.get(day) ?? []) {
            listed.add(tx.id);
            const isAdded = added.has(tx.id);
            const state: TripEntryState = excludedIds.has(tx.id) ? 'excluded' : isHomeBill(tx.category, tx.tags) && !isAdded ? 'home-bill' : 'counted';
            entries.push({ tx, state, added: isAdded, beforeTrip: false, share: shares.get(tx.id) ?? 1 });
        }
    });
    for (const tx of added.values()) {
        if (listed.has(tx.id)) continue;
        entries.push({
            tx,
            state: excludedIds.has(tx.id) ? 'excluded' : 'counted',
            added: true,
            beforeTrip: (dateKeyOf(tx.date) ?? '') < trip.startDate,
            share: shares.get(tx.id) ?? 1,
        });
    }
    entries.sort(byNewest);
    return {
        entries,
        counted: entries.filter(e => e.state === 'counted').map(e => atShare(e.tx, e.share)),
        excludedIds,
    };
}

export const resolveTripActiveTransactions = (trip: Trip, allTxs: Transaction[]): Transaction[] =>
    resolveTrip(trip, allTxs).counted;

// ---------------------------------------------------------------- editing

const snapshotKey = (s: TransactionSnapshot | undefined) =>
    s ? [s.date, s.amount, s.category, s.note, s.originalCurrency ?? ''].join('|') : '';

const sameLists = (a: TripLists, b: TripLists) => {
    const sameIds = (x: string[] = [], y: string[] = []) => x.length === y.length && x.every((id, i) => id === y[i]);
    if (!sameIds(a.excludedTransactionIds, b.excludedTransactionIds)) return false;
    if (!sameIds(a.additionalTransactionIds, b.additionalTransactionIds)) return false;
    const sa = a.transactionSnapshots || {};
    const sb = b.transactionSnapshots || {};
    const keys = Object.keys(sa);
    if (keys.length !== Object.keys(sb).length || !keys.every(k => snapshotKey(sa[k]) === snapshotKey(sb[k]))) return false;
    const pa = a.transactionShares || {};
    const pb = b.transactionShares || {};
    return Object.keys(pa).length === Object.keys(pb).length && Object.keys(pa).every(k => pa[k] === pb[k]);
};

// Shares go out only when the trip has some or had the field already: until the shares column
// exists (supabase_migration_trip_shares.sql), sending it would fail every save of the trip.
const sharesField = (trip: Trip, shares: Record<string, number>): Pick<TripLists, 'transactionShares'> =>
    trip.transactionShares !== undefined || Object.keys(shares).length > 0 ? { transactionShares: shares } : {};

/**
 * The trip's lists pointed at today's ids, each with a fresh snapshot and no leftovers — or
 * null when they already are. Ids that no longer resolve are kept: the transaction may come
 * back with the next import.
 */
export function healTripLists(trip: Trip, txs: Transaction[]): TripLists | null {
    const resolve = resolverFor(trip, indexTransactions(txs));
    const old = trip.transactionSnapshots || {};
    const snapshots: Record<string, TransactionSnapshot> = {};
    const heal = (ids: string[]) => {
        const out: string[] = [];
        for (const id of ids) {
            const tx = resolve(id);
            const current = tx ? tx.id : id;
            if (out.includes(current)) continue;
            out.push(current);
            if (tx) snapshots[current] = createSnapshot(tx);
            else if (old[id]) snapshots[current] = old[id];
        }
        return out;
    };
    const shares: Record<string, number> = {};
    for (const [id, share] of Object.entries(trip.transactionShares || {})) {
        const tx = resolve(id);
        const current = tx ? tx.id : id;
        shares[current] = share;
        if (tx) snapshots[current] = createSnapshot(tx);
        else if (old[id]) snapshots[current] = old[id];
    }
    const healed: TripLists = {
        excludedTransactionIds: heal(trip.excludedTransactionIds || []),
        additionalTransactionIds: heal(trip.additionalTransactionIds || []),
        transactionSnapshots: snapshots,
        ...sharesField(trip, shares),
    };
    return sameLists(trip, healed) ? null : healed;
}

// Rebuilds the snapshot map for the given lists and shares: a fresh one for the transaction just
// touched, the stored ones for the rest, nothing for ids that left them.
function withSnapshots(trip: Trip, excluded: string[], additional: string[], touched: Transaction, shares: Record<string, number>): TripLists {
    const old = trip.transactionSnapshots || {};
    const snapshots: Record<string, TransactionSnapshot> = {};
    for (const id of [...excluded, ...additional, ...Object.keys(shares)]) {
        if (id === touched.id) snapshots[id] = createSnapshot(touched);
        else if (old[id]) snapshots[id] = old[id];
    }
    return {
        excludedTransactionIds: excluded,
        additionalTransactionIds: additional,
        transactionSnapshots: snapshots,
        ...sharesField(trip, shares),
    };
}

// The lists and shares without any entry that points at this transaction, under its current or an old id.
function listsWithout(trip: Trip, tx: Transaction, txs: Transaction[]) {
    const resolve = resolverFor(trip, indexTransactions(txs));
    const pointsAt = (id: string) => id === tx.id || resolve(id)?.id === tx.id;
    return {
        excluded: (trip.excludedTransactionIds || []).filter(id => !pointsAt(id)),
        additional: (trip.additionalTransactionIds || []).filter(id => !pointsAt(id)),
        shares: Object.fromEntries(Object.entries(trip.transactionShares || {}).filter(([id]) => !pointsAt(id))),
    };
}

/** The trip's lists after switching one transaction on (counted, whole) or off. */
export function setTransactionCounted(trip: Trip, tx: Transaction, counted: boolean, txs: Transaction[]): TripLists {
    const { excluded, additional, shares } = listsWithout(trip, tx, txs);
    const day = dateKeyOf(tx.date) ?? '';
    const inDates = tx.type === 'expense' && day >= trip.startDate && day <= trip.endDate;
    const countsByItself = inDates && !isHomeBill(tx.category, tx.tags);
    if (counted) {
        if (!countsByItself) additional.push(tx.id);
    } else if (countsByItself) {
        excluded.push(tx.id);
    } else if (!inDates) {
        // Brought in from outside the dates: it stays listed, switched off, so it can come back.
        additional.push(tx.id);
        excluded.push(tx.id);
    }
    return withSnapshots(trip, excluded, additional, tx, shares);
}

/**
 * The trip's lists after making it count `share` of a payment (0–1): whole at 1, switched off at 0,
 * a part in between — how one payment for a flight and a hotel is split between two trips.
 */
export function setTransactionShare(trip: Trip, tx: Transaction, share: number, txs: Transaction[]): TripLists {
    if (share <= 0) return setTransactionCounted(trip, tx, false, txs);
    const on = setTransactionCounted(trip, tx, true, txs);
    const shares = { ...(on.transactionShares ?? {}) };
    if (share < 0.9999) shares[tx.id] = Math.round(share * 1e6) / 1e6;
    return withSnapshots({ ...trip, ...on }, on.excludedTransactionIds, on.additionalTransactionIds || [], tx, shares);
}

/** A suggestion the user says doesn't belong — remembered, so it isn't offered again. */
export function dismissSuggestion(trip: Trip, tx: Transaction, txs: Transaction[]): TripLists {
    const { excluded, additional, shares } = listsWithout(trip, tx, txs);
    return withSnapshots(trip, [...excluded, tx.id], additional, tx, shares);
}

// ------------------------------------------------------------- suggestions

export interface TripSuggestion {
    tx: Transaction;
    daysBefore: number;  // negative: days after the trip ended
    nameMatch: boolean;  // its tags or note mention the trip's name
}

// Words in a trip's name that say nothing about the place ("Hong Kong #second").
const NAME_NOISE = new Set(['trip', 'first', 'second', 'third', 'the', 'and']);
const nameWords = (name: string) =>
    [...new Set(name.toLowerCase().split(/[^\p{L}\p{N}]+/u))].filter(w => w.length >= 3 && !NAME_NOISE.has(w));

const isPaperwork = (category: string) => /visa|study/i.test(category);

/**
 * Travel payments around a trip that no trip counts yet: hotels and flights paid up to two
 * months ahead, tickets and tours up to three weeks ahead, anything naming the trip up to three
 * months ahead, and travel costs in the two days after it. Visas only when they name the trip —
 * the rest are residence paperwork, not journeys. Closest and name-matching first.
 */
export function suggestTripTransactions(trip: Trip, trips: Trip[], txs: Transaction[]): TripSuggestion[] {
    if (!isDayKey(trip.startDate) || !isDayKey(trip.endDate)) return [];
    const index = indexTransactions(txs);
    const own = resolveTrip(trip, txs);
    const listed = new Set(own.entries.map(e => e.tx.id));
    const countedElsewhere = new Set<string>();
    for (const other of trips) {
        if (other.id === trip.id) continue;
        for (const t of resolveTrip(other, txs).counted) countedElsewhere.add(t.id);
    }
    const words = nameWords(trip.name);
    const namesTrip = (tx: Transaction) => {
        const text = `${formatTags(tx.tags)} ${tx.note || ''}`.toLowerCase();
        return words.some(w => text.includes(w));
    };

    const out: TripSuggestion[] = [];
    const consider = (day: string, daysBefore: number) => {
        for (const tx of index.expensesByDay.get(day) ?? []) {
            if (listed.has(tx.id) || own.excludedIds.has(tx.id) || countedElsewhere.has(tx.id)) continue;
            if (getGlobalCategory(tx.category) !== 'Travel' && !isTravelSim(tx.category, tx.tags)) continue;
            const nameMatch = namesTrip(tx);
            const fits = nameMatch
                || (!isPaperwork(tx.category) && (
                    daysBefore < 0
                    || (isTravelBooking(tx.category) ? daysBefore <= 60 : daysBefore <= 21)
                ));
            if (fits) out.push({ tx, daysBefore, nameMatch });
        }
    };
    for (let n = 1; n <= 90; n++) consider(shiftDay(trip.startDate, -n), n);
    for (let n = 1; n <= 2; n++) consider(shiftDay(trip.endDate, n), -n);
    return out.sort((a, b) => Number(b.nameMatch) - Number(a.nameMatch) || Math.abs(a.daysBefore) - Math.abs(b.daysBefore));
}
