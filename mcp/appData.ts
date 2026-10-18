import type { Account, Milestone, PaycheckConfig, Trip } from '../src/types';
import { goalFromRow, type Goal, type GoalRow } from '../src/lib/goals';
import { normalizeMilestones } from '../src/lib/milestones';
import { tripFromRow, type TripRow } from '../src/lib/tripUtils';
import { currentSession, selectRows, SignInNeeded } from './session';
import { LOGIN_COMMAND } from './paths';

// What only the Grow Money account holds: the wallets' balances, trips, category limits, goals and
// the settings blob (paycheck jobs, milestones, dismissed recurring series). Read as the signed-in
// user, the same rows the app loads, and kept for a minute so one answer's several calls share them.

export interface AppPreferences {
    paycheck?: PaycheckConfig;
    recurring?: { hiddenIds?: string[] };
    milestones?: unknown;
    hiddenTripSuggestions?: string[];
}

export interface AppData {
    signedIn: boolean;
    email: string | null;
    problem: string | null;     // why the account couldn't be read, for the answer to mention
    accounts: Account[] | null; // null: not read, so the backup's balances stand in
    trips: Trip[];
    limits: Record<string, number>;
    goals: Goal[] | null;       // null: not read
    goalsNeedMigration: boolean;
    preferences: AppPreferences;
    milestones: Milestone[];
    loadedAt: number;
}

const FRESH_MS = 60_000;

const nothing = (problem: string | null, email: string | null = null): AppData => ({
    signedIn: false,
    email,
    problem,
    accounts: null,
    trips: [],
    limits: {},
    goals: null,
    goalsNeedMigration: false,
    preferences: {},
    milestones: [],
    loadedAt: Date.now(),
});

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function read(): Promise<AppData> {
    let session;
    try {
        session = await currentSession();
    } catch (e) {
        return nothing(e instanceof SignInNeeded ? e.message : `Couldn't reach the Grow Money account: ${messageOf(e)}`);
    }
    if (!session) {
        return nothing(`Not signed in to Grow Money, so wallets come from the backup and there are no trips, goals, limits or milestones. Run \`${LOGIN_COMMAND}\` in a terminal once to add them.`);
    }

    const own = { user_id: `eq.${session.user.id}` };
    const [accounts, trips, limits, goals, settings] = await Promise.allSettled([
        selectRows<Account>(session, 'accounts', { select: '*', ...own, order: 'created_at.asc' }),
        selectRows<TripRow>(session, 'trips', { select: '*', ...own }),
        selectRows<{ category: string; amount: number | string }>(session, 'category_limits', { select: 'category,amount', ...own }),
        selectRows<GoalRow>(session, 'wishlist', { select: '*', ...own, order: 'created_at.asc' }),
        selectRows<{ preferences: AppPreferences | null }>(session, 'user_settings', { select: 'preferences', ...own }),
    ]);

    const failed: string[] = [];
    const valueOf = <T,>(r: PromiseSettledResult<T>, name: string): T | null => {
        if (r.status === 'fulfilled') return r.value;
        failed.push(`${name} (${messageOf(r.reason)})`);
        return null;
    };
    const accountRows = valueOf(accounts, 'wallets');
    const tripRows = valueOf(trips, 'trips');
    const limitRows = valueOf(limits, 'limits');
    const goalRows = valueOf(goals, 'goals');
    const settingsRows = valueOf(settings, 'settings');

    const preferences = settingsRows?.[0]?.preferences ?? {};
    return {
        signedIn: true,
        email: session.user.email,
        problem: failed.length ? `Couldn't load from the Grow Money account: ${failed.join('; ')}.` : null,
        accounts: accountRows?.map(a => ({ ...a, balance: Number(a.balance) || 0 })) ?? null,
        // Newest first, as the trips store keeps them.
        trips: (tripRows ?? []).map(tripFromRow).sort((a, b) => b.startDate.localeCompare(a.startDate) || a.name.localeCompare(b.name)),
        limits: Object.fromEntries((limitRows ?? []).map(r => [r.category, Number(r.amount)])),
        goals: goalRows?.map(goalFromRow) ?? null,
        goalsNeedMigration: !!goalRows?.length && !('currency' in goalRows[0]),
        preferences,
        milestones: normalizeMilestones(preferences.milestones),
        loadedAt: Date.now(),
    };
}

let cache: AppData | null = null;
let inflight: Promise<AppData> | null = null;

export async function loadAppData(): Promise<AppData> {
    if (cache && Date.now() - cache.loadedAt < FRESH_MS) return cache;
    if (!inflight) {
        inflight = read()
            .then(data => (cache = data))
            .finally(() => { inflight = null; });
    }
    return inflight;
}
