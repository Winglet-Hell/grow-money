import { supabase } from './supabase';
import type { AppCategory, Transaction } from '../types';
import type { ImportMeta } from './importing';
import type { WalletHistory } from './netWorth';

// The account's copy of the statement (the `statements` table, owner-only): one row per user, saved
// by the device that imported or changed the operations. The user's other devices load it from
// here (lib/statementSync), and the online MCP server answers from it when Claude on the phone or
// ChatGPT asks about money.

export type CloudCopy = { status: 'saving' } | { status: 'saved' } | { status: 'failed'; message: string };

/** What the account holds, without the operations themselves. */
export interface CloudHead {
    version: string;           // updated_at as the server gives it: changes with every save
    importedAt: string;        // when the statement was imported, on whichever device
    fileName: string | null;
    count: number;
    latestDate: string | null;
}

export interface CloudStatement extends CloudHead {
    transactions: Transaction[];
    walletHistory: WalletHistory | null;
    appCategories: AppCategory[] | null;
}

/** A device's statement on its way to the account. */
export interface StatementUpload {
    transactions: Transaction[];
    meta: ImportMeta;
    walletHistory: WalletHistory | null;
    appCategories: AppCategory[] | null;
}

const HEAD = 'updated_at,imported_at,file_name,transaction_count,latest_date';

type HeadRow = { updated_at: string; imported_at: string; file_name: string | null; transaction_count: number; latest_date: string | null };

// An empty copy is never saved, so one would be a leftover: it counts as none.
const headOf = (row: HeadRow | null): CloudHead | null => (row && row.transaction_count > 0
    ? { version: row.updated_at, importedAt: row.imported_at, fileName: row.file_name, count: row.transaction_count, latestDate: row.latest_date }
    : null);

function failure(error: { code?: string; message: string }): Error {
    const missing = error.code === 'PGRST205' || error.code === '42P01' || /could not find the table/i.test(error.message);
    return new Error(missing ? 'the account has no place for it yet: run supabase_migration_statements.sql' : error.message);
}

/** Which statement the account holds, if any: a few hundred bytes. */
export async function readCloudHead(userId: string): Promise<CloudHead | null> {
    const { data, error } = await supabase.from('statements').select(HEAD).eq('user_id', userId).maybeSingle<HeadRow>();
    if (error) throw failure(error);
    return headOf(data);
}

/** The account's statement in full: about a megabyte. */
export async function downloadStatement(userId: string): Promise<CloudStatement | null> {
    const { data, error } = await supabase.from('statements')
        .select(`${HEAD},transactions,wallet_history,app_categories`)
        .eq('user_id', userId)
        .maybeSingle<HeadRow & { transactions: Transaction[]; wallet_history: WalletHistory | null; app_categories: AppCategory[] | null }>();
    if (error) throw failure(error);
    const head = headOf(data);
    if (!head || !data) return null;
    return { ...head, transactions: data.transactions, walletHistory: data.wallet_history, appCategories: data.app_categories };
}

/**
 * Saves a device's statement as the account's copy. `over` is the version it replaces: the save
 * goes through only while the account still holds that one (null: holds none yet), so a copy
 * another device saved in between is never overwritten unseen. 'any' replaces whatever is there,
 * for a statement just imported. Resolves with the new version, or null when the account's copy
 * was no longer the one expected.
 */
export async function uploadStatement(userId: string, upload: StatementUpload, over: string | null | 'any'): Promise<string | null> {
    const row = {
        file_name: upload.meta.fileName ?? null,
        imported_at: upload.meta.at,
        transaction_count: upload.transactions.length,
        latest_date: upload.meta.latestDate,
        transactions: upload.transactions,
        wallet_history: upload.walletHistory,
        app_categories: upload.appCategories,
        updated_at: new Date().toISOString(),
    };
    if (over === 'any') {
        const { data, error } = await supabase.from('statements').upsert({ user_id: userId, ...row }, { onConflict: 'user_id' })
            .select('updated_at').single<{ updated_at: string }>();
        if (error) throw failure(error);
        return data.updated_at;
    }
    if (over === null) {
        const { data, error } = await supabase.from('statements').insert({ user_id: userId, ...row })
            .select('updated_at').single<{ updated_at: string }>();
        if (error?.code === '23505') return null; // another device saved one first
        if (error) throw failure(error);
        return data.updated_at;
    }
    const { data, error } = await supabase.from('statements').update(row)
        .eq('user_id', userId).eq('updated_at', over)
        .select('updated_at');
    if (error) throw failure(error);
    return (data as { updated_at: string }[])[0]?.updated_at ?? null;
}
