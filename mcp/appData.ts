import type { Account, Milestone, PaycheckConfig, Trip } from '../src/types';
import { goalFromRow, type Goal, type GoalRow } from '../src/lib/goals';
import { normalizeMilestones } from '../src/lib/milestones';
import { tripFromRow, type TripRow } from '../src/lib/tripUtils';
import { selectRows, type UserToken } from './supabaseRest';

// What only the Grow Money account holds: the wallets' balances, trips, category limits, goals and
// the settings blob (paycheck jobs, milestones, dismissed recurring series). Read as the signed-in
// user, the same rows the app loads.

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

/** The account's part when it can't be read; `problem` says why. */
export const noAppData = (problem: string | null): AppData => ({
    signedIn: false,
    email: null,
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

export async function readAppData(auth: UserToken): Promise<AppData> {
    const own = { user_id: `eq.${auth.user.id}` };
    const [accounts, trips, limits, goals, settings] = await Promise.allSettled([
        selectRows<Account>(auth, 'accounts', { select: '*', ...own, order: 'created_at.asc' }),
        selectRows<TripRow>(auth, 'trips', { select: '*', ...own }),
        selectRows<{ category: string; amount: number | string }>(auth, 'category_limits', { select: 'category,amount', ...own }),
        selectRows<GoalRow>(auth, 'wishlist', { select: '*', ...own, order: 'created_at.asc' }),
        selectRows<{ preferences: AppPreferences | null }>(auth, 'user_settings', { select: 'preferences', ...own }),
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
        email: auth.user.email,
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
