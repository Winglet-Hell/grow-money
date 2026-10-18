import { supabase } from './supabase';
import { db } from './db';
import type { Trip, Transaction, TransactionSnapshot } from '../types';
import { healTripLists } from './tripUtils';

// Trips live in Supabase when signed in and in Dexie when signed out. They are loaded once per
// session and shared by every page that reads them (Trip Analytics, Travel Index, AI Export).
// An edit shows at once and is written in order, one trip at a time. A write that fails puts
// the trip back to what is stored and leaves a message for the page — before, the error only
// reached the console and the change vanished on the next reload.

type Listener = () => void;

export interface TripsState {
    trips: Trip[] | null; // null until the first load completes
    loadError: string | null;
    saveError: string | null;
}

let cache: { userKey: string; trips: Trip[] } | null = null;
let loadError: string | null = null;
let saveError: string | null = null;
let inflight: Promise<Trip[]> | null = null;
let state: TripsState = { trips: null, loadError: null, saveError: null };
const listeners = new Set<Listener>();
const stored = new Map<string, Trip>();             // what storage holds, per trip
const writes = new Map<string, Promise<void>>();    // the last queued write, per trip

const notify = () => {
    state = { trips: cache?.trips ?? null, loadError, saveError };
    listeners.forEach(fn => fn());
};

const messageOf = (e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    if (/'transaction_shares' column|column .*transaction_shares/i.test(message)) {
        return 'splitting a payment needs one more column in the database: run supabase_migration_trip_shares.sql in the Supabase SQL editor';
    }
    return /'(icon|budget)' column|column .*(icon|budget)/i.test(message)
        ? 'icons and budgets need two more columns in the database: run supabase_migration_trip_icon_budget.sql in the Supabase SQL editor'
        : message;
};

// A row of the Supabase `trips` table.
type TripRow = {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    excluded_transaction_ids: string[] | null;
    additional_transaction_ids: string[] | null;
    transaction_snapshots: Record<string, TransactionSnapshot> | null;
    icon?: string | null;   // both absent until supabase_migration_trip_icon_budget.sql has run
    budget?: number | string | null;
    transaction_shares?: Record<string, number> | null; // absent until supabase_migration_trip_shares.sql has run
};

const fromRow = (t: TripRow): Trip => ({
    id: t.id,
    name: t.name,
    startDate: t.start_date,
    endDate: t.end_date,
    excludedTransactionIds: t.excluded_transaction_ids || [],
    additionalTransactionIds: t.additional_transaction_ids || [],
    transactionSnapshots: t.transaction_snapshots || {},
    ...(t.icon !== undefined ? { icon: t.icon } : {}),
    ...(t.budget !== undefined ? { budget: t.budget === null ? null : Number(t.budget) } : {}),
    ...(t.transaction_shares !== undefined ? { transactionShares: t.transaction_shares || {} } : {}),
});

// Icon, budget and shares go out only once a trip has them, so trips keep saving before the columns exist.
const toRow = (t: Trip) => ({
    name: t.name,
    start_date: t.startDate,
    end_date: t.endDate,
    excluded_transaction_ids: t.excludedTransactionIds,
    additional_transaction_ids: t.additionalTransactionIds || [],
    transaction_snapshots: t.transactionSnapshots || {},
    ...(t.icon !== undefined ? { icon: t.icon } : {}),
    ...(t.budget !== undefined ? { budget: t.budget } : {}),
    ...(t.transactionShares !== undefined ? { transaction_shares: t.transactionShares } : {}),
});

const byStartDesc = (a: Trip, b: Trip) => b.startDate.localeCompare(a.startDate) || a.name.localeCompare(b.name);

const storedForm = (t: Trip) => JSON.stringify(toRow(t));

async function currentUserKey(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? 'anon';
}

async function query(userKey: string): Promise<Trip[]> {
    if (userKey === 'anon') {
        const local = await db.trips.toArray();
        return local.map(t => ({
            ...t,
            excludedTransactionIds: t.excludedTransactionIds || [],
            additionalTransactionIds: t.additionalTransactionIds || [],
            transactionSnapshots: t.transactionSnapshots || {},
        }));
    }
    const { data, error } = await supabase.from('trips').select('*').eq('user_id', userKey);
    if (error) throw new Error(error.message);
    return (data ?? []).map(fromRow);
}

function setTrips(trips: Trip[]) {
    if (!cache) return;
    cache = { ...cache, trips: [...trips].sort(byStartDesc) };
    notify();
}

export function getTripsState(): TripsState {
    return state;
}

export function subscribeTrips(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

/** Loads the trips once per user; later calls reuse them unless `force` is set. */
export async function loadTrips(force = false): Promise<Trip[]> {
    const userKey = await currentUserKey();
    if (!force && cache && cache.userKey === userKey) return cache.trips;
    if (inflight) return inflight;
    inflight = (async () => {
        try {
            const trips = (await query(userKey)).sort(byStartDesc);
            cache = { userKey, trips };
            stored.clear();
            trips.forEach(t => stored.set(t.id, t));
            loadError = null;
            return trips;
        } catch (e) {
            loadError = `Couldn't load your trips: ${messageOf(e)}`;
            return cache?.trips ?? [];
        } finally {
            inflight = null;
            notify();
        }
    })();
    return inflight;
}

/** On sign-out the next user must not see the previous one's trips. */
export function clearTripsCache(): void {
    cache = null;
    stored.clear();
    loadError = null;
    saveError = null;
    notify();
}

export function clearTripsSaveError(): void {
    saveError = null;
    notify();
}

async function write(trip: Trip, userKey: string) {
    if (userKey === 'anon') {
        await db.trips.put(trip);
        return;
    }
    const { error } = await supabase.from('trips').update(toRow(trip)).eq('id', trip.id);
    if (error) throw new Error(messageOf(error.message));
}

/**
 * Applies a change to a trip at once and stores it after any earlier write of the same trip.
 * Rejects (after undoing the change) when it can't be stored; `quiet` skips the message, for
 * upkeep the user didn't ask for.
 */
export function updateTrip(id: string, patch: Partial<Omit<Trip, 'id'>>, { quiet = false } = {}): Promise<void> {
    const userKey = cache?.userKey;
    const current = cache?.trips.find(t => t.id === id);
    if (!userKey || !current) return Promise.reject(new Error('This trip is no longer loaded.'));
    setTrips(cache!.trips.map(t => (t.id === id ? { ...t, ...patch } : t)));

    const run = (writes.get(id) ?? Promise.resolve()).catch(() => undefined).then(async () => {
        if (cache?.userKey !== userKey) return; // signed out meanwhile
        const latest = cache.trips.find(t => t.id === id);
        if (!latest) return; // deleted meanwhile
        const last = stored.get(id);
        if (last && storedForm(last) === storedForm(latest)) return; // a later edit already stored this
        try {
            await write(latest, userKey);
            stored.set(id, latest);
        } catch (e) {
            if (last && cache?.userKey === userKey) setTrips(cache.trips.map(t => (t.id === id ? last : t)));
            if (!quiet) {
                saveError = `Couldn't save "${latest.name}" — ${messageOf(e)}. The last change was undone.`;
                notify();
            }
            throw e;
        }
    });
    writes.set(id, run);
    return run;
}

/**
 * Points every trip's links at the transactions' current ids (see healTripLists) and stores the
 * trips that changed. Run after a backup import, it moves links made from Excel exports over to
 * the app's own ids, which no edit in the app breaks. Resolves with the number of trips moved.
 */
export async function healTrips(txs: Transaction[]): Promise<number> {
    const trips = await loadTrips();
    const healed = trips.flatMap(trip => {
        const lists = healTripLists(trip, txs);
        return lists ? [updateTrip(trip.id, lists, { quiet: true })] : [];
    });
    return (await Promise.allSettled(healed)).filter(r => r.status === 'fulfilled').length;
}

export async function createTrip(input: { name: string; startDate: string; endDate: string; icon?: string | null; budget?: number | null }): Promise<Trip> {
    const userKey = cache?.userKey ?? (await currentUserKey());
    let trip: Trip;
    if (userKey === 'anon') {
        trip = { id: crypto.randomUUID(), ...input, excludedTransactionIds: [], additionalTransactionIds: [], transactionSnapshots: {} };
        if (!trip.icon) delete trip.icon;
        if (trip.budget == null) delete trip.budget;
        await db.trips.add(trip);
    } else {
        const { data, error } = await supabase
            .from('trips')
            .insert({
                user_id: userKey,
                name: input.name,
                start_date: input.startDate,
                end_date: input.endDate,
                excluded_transaction_ids: [],
                additional_transaction_ids: [],
                transaction_snapshots: {},
                ...(input.icon ? { icon: input.icon } : {}),
                ...(input.budget != null ? { budget: input.budget } : {}),
            })
            .select()
            .single();
        if (error) throw new Error(messageOf(error.message));
        trip = fromRow(data);
    }
    stored.set(trip.id, trip);
    if (cache?.userKey === userKey) setTrips([trip, ...cache.trips]);
    return trip;
}

export async function deleteTrip(id: string): Promise<void> {
    const userKey = cache?.userKey ?? (await currentUserKey());
    if (userKey === 'anon') {
        await db.trips.delete(id);
    } else {
        const { error } = await supabase.from('trips').delete().eq('id', id);
        if (error) throw new Error(messageOf(error.message));
    }
    stored.delete(id);
    if (cache?.userKey === userKey) setTrips(cache.trips.filter(t => t.id !== id));
}
