import { supabase } from './supabase';
import { db } from './db';
import type { Account, Transaction, WalletSnapshot } from '../types';
import { normalizeCurrencyCode, inferCurrencyFromName, isCryptoCode } from './currencies';

// Wallets are matched by name, ignoring case and spaces, the way operations refer to them
// ("USDT Bybit" and "Usdt bybit" are one wallet).
const walletKey = (name: string) => (name || '').toLowerCase().replace(/\s+/g, '');

export function inferAccountDetails(accountName: string, detectedCurrency?: string): Partial<Account> {
    const lowerName = accountName.toLowerCase();

    // The currency recorded on the transaction wins; otherwise look for a code in the
    // account's own name ("Cash KRW" → KRW, "GoPay IDR" → IDR).
    const currency = normalizeCurrencyCode(detectedCurrency || '')
        || inferCurrencyFromName(accountName)
        || 'THB';

    let type: Account['type'] = 'cash'; // Default
    if (isCryptoCode(currency)) {
        type = 'crypto';
    } else if (lowerName.includes('bank') || lowerName.includes('card') || lowerName.includes('main')) {
        type = 'bank';
    } else if (lowerName.includes('wallet')) {
        type = 'wallet';
    }

    return { type, currency };
}

// Auto-create DB rows for every account referenced by any operation — expense/income
// source, and BOTH legs of transfers (outgoing account + incoming `category`). New
// accounts start at balance 0 (balances are entered manually). Matching is done on a
// normalized name so different casing (e.g. "USDT Bybit" vs "Usdt bybit") doesn't spawn
// duplicates. Currencies are only used to seed a sensible default; existing accounts are
// never overwritten (the user controls them manually).
// Resolves with the display names of the wallets it created, so the import summary can
// point the user at them.
export async function syncAccountsWithSupabase(transactions: Transaction[], userId: string): Promise<string[]> {
    if (!transactions.length || !userId) return [];

    try {
        // Collect every referenced account, deduped by normalized name.
        const collected = new Map<string, { name: string; detectedCurrency?: string }>();
        const record = (name: string | undefined, currency?: string) => {
            if (!name) return;
            const key = walletKey(name);
            if (!key || key === 'unknown' || key === 'uncategorized') return;
            const existing = collected.get(key);
            if (!existing) {
                collected.set(key, { name, detectedCurrency: currency });
            } else if (currency && !existing.detectedCurrency) {
                existing.detectedCurrency = currency;
            }
        };

        transactions.forEach(t => {
            // Expense/income/transfer source account
            record(t.account, t.fromCurrency || t.originalCurrency || t.currency);
            // Transfer destination account (the incoming side)
            if (t.type === 'transfer') {
                record(t.category, t.toCurrency || t.originalCurrency);
            }
        });

        if (collected.size === 0) return [];

        // Which accounts already exist? (match by normalized name)
        const { data: existingAccounts, error: fetchError } = await supabase
            .from('accounts')
            .select('name')
            .eq('user_id', userId);

        if (fetchError) {
            console.error('Error fetching existing accounts:', fetchError);
            return [];
        }

        const existingNorm = new Set((existingAccounts || []).map(a => walletKey(a.name)));

        const newAccountsToCreate: Omit<Account, 'id' | 'created_at'>[] = [];
        collected.forEach(({ name, detectedCurrency }, key) => {
            if (existingNorm.has(key)) return;
            const { type, currency } = inferAccountDetails(name, detectedCurrency);
            newAccountsToCreate.push({
                user_id: userId,
                name, // preserve the display name we saw first (source name wins over sentence-cased dest)
                type: type || 'cash',
                currency: currency || 'THB',
                balance: 0, // manual — user sets the real balance later
                is_hidden: false,
            });
        });

        if (newAccountsToCreate.length === 0) return [];

        const { error: insertError } = await supabase
            .from('accounts')
            .insert(newAccountsToCreate);

        if (insertError) {
            console.error('Error creating new accounts:', insertError);
            return [];
        }
        return newAccountsToCreate.map(a => a.name);
    } catch (err) {
        console.error('Unexpected error during account sync:', err);
        return [];
    }
}

// What a backup import did to the stored wallets, for the import dialog.
export interface WalletSyncReport {
    asOf: string;
    added: string[];
    changed: { name: string; before: number; beforeCurrency: string; after: number; currency: string }[];
    refined: string[]; // the stored balance was the backup's, rounded: only its decimals were added
    archived: string[];
    unarchived: string[];
    notInBackup: string[]; // stored here only, left as they are: renamed or deleted in the app?
    error?: string;
}

// Digits after the point in a number as JS writes it ("2e-8" has 8).
const decimalsOf = (n: number) => {
    const [digits, exponent] = String(n).split('e-');
    return (digits.split('.')[1]?.length ?? 0) + (exponent ? Number(exponent) : 0);
};

/** What a backup changes in the stored wallets. The backup is the authority on every wallet it
 *  has: its name as the app writes it, currency, balance and whether it is archived. A stored
 *  wallet the backup doesn't have is left alone, and an archived one that isn't stored here is
 *  not created. Pure, so the plan can be checked before anything is written. */
export function planWalletSync(stored: Account[], snapshot: WalletSnapshot, userId: string) {
    const byKey = new Map(stored.map(a => [walletKey(a.name), a]));
    const seen = new Set<string>();
    const updates: Account[] = [];
    const inserts: Omit<Account, 'id' | 'created_at'>[] = [];
    const report: WalletSyncReport = { asOf: snapshot.asOf, added: [], changed: [], refined: [], archived: [], unarchived: [], notInBackup: [] };

    for (const w of snapshot.wallets) {
        const key = walletKey(w.name);
        if (seen.has(key)) continue;
        seen.add(key);
        const row = byKey.get(key);
        if (!row) {
            if (w.archived) continue;
            const { type } = inferAccountDetails(w.name, w.currency);
            inserts.push({ user_id: userId, name: w.name, type: type || 'cash', currency: w.currency, balance: w.balance, balance_date: snapshot.asOf, is_hidden: false });
            report.added.push(w.name);
            continue;
        }
        // Dated as of the backup even when the number stays: it was true then.
        updates.push({ ...row, name: w.name, currency: w.currency, balance: w.balance, balance_date: snapshot.asOf, is_hidden: w.archived });
        if (row.balance !== w.balance || row.currency !== w.currency) {
            const rounded = row.currency === w.currency && Number(w.balance.toFixed(Math.min(decimalsOf(row.balance), 100))) === row.balance;
            if (rounded) report.refined.push(w.name);
            else report.changed.push({ name: w.name, before: row.balance, beforeCurrency: row.currency, after: w.balance, currency: w.currency });
        }
        if (w.archived && !row.is_hidden) report.archived.push(w.name);
        if (!w.archived && row.is_hidden) report.unarchived.push(w.name);
    }
    report.notInBackup = stored.filter(a => !seen.has(walletKey(a.name))).map(a => a.name);
    return { updates, inserts, report };
}

/** Sets the stored wallets from a backup (see planWalletSync) and reports what changed. */
export async function syncWalletsFromBackup(snapshot: WalletSnapshot, userId: string): Promise<WalletSyncReport> {
    const failed = (error: unknown): WalletSyncReport => ({
        asOf: snapshot.asOf, added: [], changed: [], refined: [], archived: [], unarchived: [], notInBackup: [],
        error: (error as { message?: string })?.message ?? String(error),
    });
    try {
        const { data, error } = await supabase.from('accounts').select('*').eq('user_id', userId);
        if (error) return failed(error);
        const { updates, inserts, report } = planWalletSync(data ?? [], snapshot, userId);
        if (updates.length) {
            const { error: upsertError } = await supabase.from('accounts').upsert(updates);
            if (upsertError) return failed(upsertError);
        }
        if (inserts.length) {
            const { error: insertError } = await supabase.from('accounts').insert(inserts);
            if (insertError) return failed(insertError);
        }
        return report;
    } catch (err) {
        return failed(err);
    }
}

export async function createManualAccount(
    userId: string,
    name: string,
    currency: string,
    initialBalance: number,
    type: Account['type']
): Promise<{ success: boolean; error?: any }> {
    try {
        const { error } = await supabase
            .from('accounts')
            .insert({
                user_id: userId,
                name,
                currency,
                balance: initialBalance,
                balance_date: new Date().toISOString(),
                type,
                is_hidden: false
            });

        if (error) {
            console.error('Error creating manual account:', error);
            return { success: false, error };
        }

        return { success: true };
    } catch (err) {
        return { success: false, error: err };
    }
}

export async function updateAccount(
    accountId: string,
    updates: Partial<Account>
): Promise<{ success: boolean; error?: any }> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: 'User not logged in' };

        // Check if accountId is a valid UUID
        const isUuid = isStoredAccountId(accountId);

        if (!isUuid) {
            // It's a dynamic account being edited. We need to CREATE it in the DB.
            // "accountId" here is likely the normalized name or original name.
            // We should trust the 'updates.name' or fallback to a name derivation if needed, 
            // but ideally the frontend passed the current name in 'updates'.

            // Wait, if updates doesn't have all fields (like type, currency), we might fail to create properly.
            // But EditAccountModal sends ALL fields.

            const { error } = await supabase
                .from('accounts')
                .insert({
                    user_id: user.id,
                    name: updates.name || accountId, // Fallback to ID which might be name
                    currency: updates.currency || 'THB',
                    balance: updates.balance || 0,
                    type: updates.type || 'cash',
                    balance_date: updates.balance_date,
                    balance_checkpoint_tx_id: updates.balance_checkpoint_tx_id,
                    is_hidden: false
                });

            if (error) {
                console.error('Error promoting dynamic account:', error);
                return { success: false, error };
            }
        } else {
            // Standard Update
            const { error } = await supabase
                .from('accounts')
                .update(updates)
                .eq('id', accountId);

            if (error) {
                console.error('Error updating account:', error);
                return { success: false, error };
            }
        }

        return { success: true };
    } catch (err) {
        return { success: false, error: err };
    }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the id is a real DB row (discovered accounts use a name-derived id instead). */
export const isStoredAccountId = (accountId: string) => UUID_RE.test(accountId);

// Removes the account row. Local transactions are untouched — if any still reference the
// account by name it will simply be rediscovered (balance 0) and re-created on the next import.
export async function deleteAccount(accountId: string): Promise<{ success: boolean; error?: any }> {
    if (!isStoredAccountId(accountId)) return { success: true };
    try {
        const { error } = await supabase
            .from('accounts')
            .delete()
            .eq('id', accountId);

        if (error) {
            console.error('Error deleting account:', error);
            return { success: false, error };
        }
        return { success: true };
    } catch (err) {
        return { success: false, error: err };
    }
}

// Folds one stored wallet into another of the same currency: the balance moves over,
// local operations that named the old wallet are re-pointed at the new one, and the
// old row is deleted. This is how a wallet renamed in the source app (which has no
// stable account id, so every rename imports as a brand-new zero-balance wallet) gets
// its balance back without retyping it.
export async function mergeAccounts(
    source: { id: string; name: string; currency: string; balance: number },
    target: { id: string; name: string; currency: string; balance: number }
): Promise<{ success: boolean; renamed: number; error?: any }> {
    if (source.currency !== target.currency) {
        return { success: false, renamed: 0, error: 'Wallets must share a currency to merge balances' };
    }
    if (!isStoredAccountId(target.id)) {
        return { success: false, renamed: 0, error: 'Target wallet is not saved yet' };
    }
    try {
        const { error: updateError } = await supabase
            .from('accounts')
            .update({ balance: source.balance + target.balance, balance_date: new Date().toISOString() })
            .eq('id', target.id);
        if (updateError) return { success: false, renamed: 0, error: updateError };

        const renamedSources = await db.transactions.where('account').equals(source.name).modify({ account: target.name });
        const renamedDestinations = await db.transactions
            .where('category').equals(source.name)
            .and(t => t.type === 'transfer')
            .modify({ category: target.name });

        if (isStoredAccountId(source.id)) {
            const { error: deleteError } = await supabase.from('accounts').delete().eq('id', source.id);
            if (deleteError) return { success: false, renamed: renamedSources + renamedDestinations, error: deleteError };
        }
        return { success: true, renamed: renamedSources + renamedDestinations };
    } catch (err) {
        return { success: false, renamed: 0, error: err };
    }
}
