import { supabase } from './supabase';
import type { Account, Transaction } from '../types';

export function inferAccountDetails(accountName: string, detectedCurrency?: string): Partial<Account> {
    const lowerName = accountName.toLowerCase();

    let type: Account['type'] = 'cash'; // Default
    let currency = 'THB'; // Default

    // Use detected currency if available and valid
    if (detectedCurrency && detectedCurrency.length === 3) {
        currency = detectedCurrency.toUpperCase();

        // Infer type based on currency if generic
        if (['USDT', 'BTC', 'ETH'].includes(currency)) {
            type = 'crypto';
        } else if (['RUB', 'USD', 'EUR', 'GBP'].includes(currency)) {
            // If name suggests bank, keep it, otherwise generic fiat might be cash or bank
            if (lowerName.includes('bank') || lowerName.includes('card') || lowerName.includes('main')) {
                type = 'bank';
            }
        }
    } else {
        // Name-based inference only if no currency detected
        if (lowerName.includes('usd')) { currency = 'USD'; }
        else if (lowerName.includes('eur')) { currency = 'EUR'; }
        else if (lowerName.includes('hkd')) { currency = 'HKD'; }
        else if (lowerName.includes('myr')) { currency = 'MYR'; }
        else if (lowerName.includes('rub') || lowerName.includes('main')) { currency = 'RUB'; type = 'bank'; }
        else if (lowerName.includes('btc')) { currency = 'BTC'; type = 'crypto'; }
        else if (lowerName.includes('usdt')) { currency = 'USDT'; type = 'crypto'; }
    }

    // Explicit name override for type if not already set effectively
    if (lowerName.includes('btc') || lowerName.includes('usdt')) { type = 'crypto'; }

    return { type, currency };
}

export async function syncAccountsWithSupabase(transactions: Transaction[], userId: string): Promise<void> {
    if (!transactions.length || !userId) return;

    try {
        // 1. Group transactions by account to find details
        const accountMap = new Map<string, { originalCurrency?: string }>();

        transactions.forEach(t => {
            if (!t.account) return;

            if (!accountMap.has(t.account)) {
                accountMap.set(t.account, {});
            }

            // Try to find a valid original currency
            // We prioritize the first non-null originalCurrency we find
            const currentInfo = accountMap.get(t.account)!;
            if (t.originalCurrency && !currentInfo.originalCurrency) {
                currentInfo.originalCurrency = t.originalCurrency;
            }
        });

        const uniqueAccountNames = Array.from(accountMap.keys());
        if (uniqueAccountNames.length === 0) return;

        // 2. Fetch existing accounts for the user
        const { data: existingAccounts, error: fetchError } = await supabase
            .from('accounts')
            .select('id, name, currency')
            .eq('user_id', userId);

        if (fetchError) {
            console.error('Error fetching existing accounts:', fetchError);
            return;
        }

        const existingMap = new Map<string, { id: string; currency: string }>();
        existingAccounts?.forEach(a => existingMap.set(a.name, { id: a.id, currency: a.currency }));

        // 3. Identify new accounts AND accounts to update
        const newAccountsToCreate: Omit<Account, 'id' | 'created_at'>[] = [];
        const accountsToUpdate: { id: string; currency: string }[] = [];

        uniqueAccountNames.forEach(name => {
            // Get detected currency from transactions
            const detectedCurrency = accountMap.get(name)?.originalCurrency;
            // Infer details to get the "ideal" currency
            const { currency: inferredCurrency } = inferAccountDetails(name, detectedCurrency);

            if (existingMap.has(name)) {
                // Check if we need to update the existing account
                const existing = existingMap.get(name)!;

                // Update if:
                // 1. We have a specific inferred currency
                // 2. The inferred currency is NOT 'THB' (don't overwrite with default)
                // 3. AND the inferred currency is different from existing
                if (inferredCurrency &&
                    inferredCurrency !== 'THB' &&
                    existing.currency !== inferredCurrency) {

                    console.log(`Updating account "${name}" currency from ${existing.currency} to ${inferredCurrency}`);
                    accountsToUpdate.push({ id: existing.id, currency: inferredCurrency });
                }

            } else {
                newAccountsToCreate.push({
                    user_id: userId,
                    name: name, // CRITICAL: Preserve exact name
                    type: inferAccountDetails(name, detectedCurrency).type || 'cash',
                    currency: inferredCurrency || 'THB',
                    balance: 0, // Initial balance is 0, will be built up by transactions
                    is_hidden: false
                });
            }
        });

        // 4. Insert new accounts
        if (newAccountsToCreate.length > 0) {
            const { error: insertError } = await supabase
                .from('accounts')
                .insert(newAccountsToCreate);

            if (insertError) {
                console.error('Error creating new accounts:', insertError);
            } else {
                console.log(`Successfully created ${newAccountsToCreate.length} new accounts.`);
            }
        }

        // 5. Update existing accounts
        if (accountsToUpdate.length > 0) {
            // Process updates in parallel or batch
            const updatePromises = accountsToUpdate.map(acc =>
                supabase
                    .from('accounts')
                    .update({ currency: acc.currency })
                    .eq('id', acc.id)
            );

            await Promise.all(updatePromises);
            console.log(`Successfully updated currency for ${accountsToUpdate.length} accounts.`);
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
