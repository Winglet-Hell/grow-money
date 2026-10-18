import { goalFromRow, type Goal, type GoalRow, type GoalValues } from './goals';
import { supabase } from './supabase';

// The goals as Supabase keeps them, in the `wishlist` table. What a goal is and how the plan is
// worked out are in lib/goals, which needs no database.

export const MIGRATION_HINT = 'Run supabase_migration_goals.sql in the Supabase SQL editor: the goals table has no place for a currency or a reached date yet.';

function failure(action: string, error: { code?: string; message: string }): Error {
    // PostgREST answers PGRST204 when a column the request names doesn't exist.
    if (error.code === 'PGRST204' || /could not find the '.+' column|column .+ does not exist/i.test(error.message)) return new Error(MIGRATION_HINT);
    return new Error(`Couldn't ${action}: ${error.message}`);
}

/** The user's goals, oldest first. `needsMigration`: the rows came without the new columns. */
export async function loadGoals(userId: string): Promise<{ goals: Goal[]; needsMigration: boolean }> {
    const { data, error } = await supabase.from('wishlist').select('*').eq('user_id', userId).order('created_at');
    if (error) throw failure('load the goals', error);
    const rows = (data ?? []) as GoalRow[];
    return { goals: rows.map(goalFromRow), needsMigration: rows.length > 0 && !('currency' in rows[0]) };
}

const columnsOf = (values: GoalValues, costRUB: number) => ({
    name: values.name,
    price: values.price,
    currency: values.currency,
    costRUB,
    priority: values.priority,
    imageURL: values.icon,
});

export async function createGoal(userId: string, values: GoalValues, costRUB: number): Promise<Goal> {
    const { data, error } = await supabase.from('wishlist').insert({ ...columnsOf(values, costRUB), user_id: userId }).select().single();
    if (error) throw failure('add the goal', error);
    return goalFromRow(data as GoalRow);
}

export async function updateGoal(id: string, values: GoalValues, costRUB: number): Promise<Goal> {
    const { data, error } = await supabase.from('wishlist').update(columnsOf(values, costRUB)).eq('id', id).select().single();
    if (error) throw failure('save the goal', error);
    return goalFromRow(data as GoalRow);
}

/** Marks a goal reached on `day`, or opens it again with null. */
export async function setGoalReached(id: string, day: string | null): Promise<Goal> {
    const { data, error } = await supabase.from('wishlist').update({ reached_on: day }).eq('id', id).select().single();
    if (error) throw failure(day ? 'mark the goal reached' : 'open the goal again', error);
    return goalFromRow(data as GoalRow);
}

export async function deleteGoal(id: string): Promise<void> {
    const { error } = await supabase.from('wishlist').delete().eq('id', id);
    if (error) throw failure('delete the goal', error);
}
