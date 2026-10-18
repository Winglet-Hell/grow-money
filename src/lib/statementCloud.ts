import { supabase } from './supabase';
import type { Transaction } from '../types';
import type { ImportMeta } from './importing';
import { readWalletHistory } from './netWorth';

// A copy of the last imported statement in the user's own account (the `statements` table,
// owner-only): what the online MCP server answers from when Claude on the phone or ChatGPT asks
// about money. The pages keep reading the copy on this device; this one is only ever written here.

export type CloudCopy = { status: 'saving' } | { status: 'saved' } | { status: 'failed'; message: string };

function failure(error: { code?: string; message: string }): Error {
    const missing = error.code === 'PGRST205' || error.code === '42P01' || /could not find the table/i.test(error.message);
    return new Error(missing ? 'the account has no place for it yet: run supabase_migration_statements.sql' : error.message);
}

/** Saves this device's statement as the account's copy, in place of the previous one. */
export async function saveStatementCopy(userId: string, transactions: Transaction[], meta: ImportMeta): Promise<void> {
    const { error } = await supabase.from('statements').upsert({
        user_id: userId,
        file_name: meta.fileName ?? null,
        imported_at: meta.at,
        transaction_count: transactions.length,
        latest_date: meta.latestDate,
        transactions,
        // The last backup's day-by-day balances; an Excel import keeps them, as on this device.
        wallet_history: readWalletHistory(),
        updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw failure(error);
}

/**
 * Saves the copy when the account has none or an older one than this device's import: the first
 * time after this was added, and after a save that failed. Resolves with whether it saved.
 */
export async function refreshStatementCopy(userId: string, transactions: Transaction[], meta: ImportMeta | null): Promise<boolean> {
    if (!meta || transactions.length === 0) return false;
    const { data, error } = await supabase.from('statements').select('imported_at').eq('user_id', userId).maybeSingle();
    if (error) throw failure(error);
    if (data && Date.parse(data.imported_at) >= Date.parse(meta.at)) return false;
    await saveStatementCopy(userId, transactions, meta);
    return true;
}
