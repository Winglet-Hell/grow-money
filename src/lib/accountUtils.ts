import { supabase } from './supabase';
import type { Account, Transaction } from '../types';
import { normalizeCurrencyCode, inferCurrencyFromName, isCryptoCode } from './currencies';

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
export async function syncAccountsWithSupabase(transactions: Transaction[], userId: string): Promise<void> {
    if (!transactions.length || !userId) return;

    try {
        const normalize = (s: string) => (s || '').toLowerCase().replace(/\s+/g, '');

        // Collect every referenced account, deduped by normalized name.
        const collected = new Map<string, { name: string; detectedCurrency?: string }>();
        const record = (name: string | undefined, currency?: string) => {
            if (!name) return;
            const key = normalize(name);
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

        if (collected.size === 0) return;

        // Which accounts already exist? (match by normalized name)
        const { data: existingAccounts, error: fetchError } = await supabase
            .from('accounts')
            .select('name')
            .eq('user_id', userId);

        if (fetchError) {
            console.error('Error fetching existing accounts:', fetchError);
            return;
        }

        const existingNorm = new Set((existingAccounts || []).map(a => normalize(a.name)));

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

        if (newAccountsToCreate.length > 0) {
            const { error: insertError } = await supabase
                .from('accounts')
                .insert(newAccountsToCreate);

            if (insertError) {
                console.error('Error creating new accounts:', insertError);
            } else {
                console.log(`Auto-created ${newAccountsToCreate.length} account(s) from transactions.`);
            }
        }
    } catch (err) {
        console.error('Unexpected error during account sync:', err);
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
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId);

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
