import { useState, useEffect, useMemo } from 'react';
import type { Transaction, Account } from '../types';
import { supabase } from '../lib/supabase';
import { inferAccountDetails } from '../lib/accountUtils';

export interface AccountConfig {
    id: string;
    name: string;
    currency: string;
    initial: number;
    type: 'wallet' | 'crypto' | 'bank' | 'cash' | 'card';
    balance_date?: string;
    balance_checkpoint_tx_id?: string;
}

export interface AccountStatus extends AccountConfig {
    current: number;
    rubEquivalent: number;
    hasPassedCheckpoint?: boolean; // Runtime flag
}

const DEFAULT_RATES: Record<string, number> = {
    USDT: 98,
    USD: 98,
    THB: 2.8,
    RUB: 1,
    MYR: 23,
    HKD: 13,
    BTC: 9500000,
};

const ANCHOR_DATE = new Date('2026-01-06T00:00:00');

export function useAccounts(transactions: Transaction[]) {
    const [rates, setRates] = useState<Record<string, number>>(DEFAULT_RATES);
    const [dbAccounts, setDbAccounts] = useState<Account[]>([]);
    const [isLoadingRates, setIsLoadingRates] = useState(false);
    const [isLiveRates, setIsLiveRates] = useState(false);

    // Fetch Accounts from DB
    const fetchSupabaseAccounts = async () => {
        const { data: { user } } = await supabase.auth.getUser();

        let query = supabase.from('accounts').select('*');

        if (user) {
            query = query.eq('user_id', user.id);
        } else {
            query = query.is('user_id', null);
        }

        const { data } = await query;
        if (data) {
            setDbAccounts(data);
        }
    };

    useEffect(() => {
        fetchSupabaseAccounts();
    }, [transactions]);

    // Fetch Rates
    useEffect(() => {
        const fetchRates = async () => {
            setIsLoadingRates(true);
            try {
                const response = await fetch('https://latest.currency-api.pages.dev/v1/currencies/rub.json');
                const data = await response.json();

                if (data && data.rub) {
                    const newRates: Record<string, number> = { ...DEFAULT_RATES };
                    const apiRates = data.rub;

                    Object.keys(apiRates).forEach(currency => {
                        const code = currency.toUpperCase();
                        const rate = apiRates[currency];
                        if (rate > 0) {
                            newRates[code] = 1 / rate;
                        }
                    });

                    if (newRates['USD']) {
                        newRates['USDT'] = newRates['USD'];
                    }

                    setRates(newRates);
                    setIsLiveRates(true);
                }
            } catch (error) {
                console.error('Failed to fetch rates:', error);
                setIsLiveRates(false);
            } finally {
                setIsLoadingRates(false);
            }
        };

        fetchRates();
    }, []);

    // Verify Hook Execution
    // console.log('[useAccounts Hook] Called. Transactions:', transactions?.length);

    const accounts = useMemo(() => {
        const balances: AccountStatus[] = [];
        const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '');
        // Hybrid Mode: Always allow discovering new accounts from transactions
        // even if some accounts already exist in DB.
        const useDynamicAccounts = true;

        // 1. Initialize from DB Accounts if available
        if (dbAccounts.length > 0) {
            dbAccounts.forEach(acc => {
                balances.push({
                    id: acc.id || normalize(acc.name),
                    name: acc.name,
                    currency: acc.currency,
                    initial: acc.balance,
                    type: acc.type,
                    current: acc.balance, // Start with Initial
                    rubEquivalent: 0,
                    balance_date: acc.balance_date,
                    balance_checkpoint_tx_id: acc.balance_checkpoint_tx_id
                });
            });
        }

        // 2. Process Transactions to update balances
        // If NO DB accounts, we generate dynamic ones on the fly (Hybrid/Legacy mode)
        // const useDynamicAccounts = dbAccounts.length === 0; // Moved to top

        if (Array.isArray(transactions)) {
            // Sort transactions
            const sorted = [...transactions].sort((a, b) => {
                // Primary sort: Date ASC (Oldest -> Newest)
                if (a.date !== b.date) return a.date.localeCompare(b.date);

                // Secondary sort: Index DESC (File Bottom/Oldest -> File Top/Newest)
                // Assuming high index = older transaction in file
                return (b.index || 0) - (a.index || 0);
            });

            if (sorted.length > 0) {
                // Removed info log to reduce noise, kept rub debug
            }




            // Helper to check if a transaction should be applied based on account checkpoint
            // Uses a closure to update the account's runtime state (hasPassedCheckpoint)
            const shouldApplyToAccount = (account: AccountStatus, t: Transaction): boolean => {
                // 1. Checkpoint Logic
                if (account.balance_date) {
                    const checkpointDateStr = account.balance_date.split('T')[0];
                    const txDateStr = t.date;

                    // Past
                    if (txDateStr < checkpointDateStr) return false;

                    // Future
                    if (txDateStr > checkpointDateStr) {
                        // DEBUG TIMEZONE
                        // console.log(`[Date Debug] ${account.name}: Tx ${txDateStr} > Checkpoint ${checkpointDateStr} -> INCLUDED`);
                        return true;
                    }

                    // Same Date
                    if (txDateStr === checkpointDateStr) {
                        if (account.balance_checkpoint_tx_id) {
                            if (account.hasPassedCheckpoint) return true;

                            if (t.id === account.balance_checkpoint_tx_id) {
                                account.hasPassedCheckpoint = true;
                                return false; // Exclude checkpoint itself
                            }
                            return false; // Not passed yet
                        }
                        // If no checkpoint ID is set, assume the balance provided is the CLOSING balance for this date.
                        // Therefore, ignore all transactions on this date (they are already baked in).
                        return false;
                    }
                } else {
                    // Legacy/Anchor Logic
                    if (new Date(t.date) <= ANCHOR_DATE && useDynamicAccounts) return false;
                }

                // 2. Initial Balance Logic
                const noteLower = (t.note || '').toLowerCase();
                const isInitialTx = noteLower.includes('initial balance') || noteLower.includes('start balance');
                if (isInitialTx && !useDynamicAccounts && Math.abs(account.initial) > 0.01) {
                    return false;
                }

                return true;
            };

            sorted.forEach(t => {
                // ACCOUNT MATCHING (Source)
                let idx = -1;
                const txAccountNorm = normalize(t.account);

                const matchingIndices: number[] = [];
                balances.forEach((b, i) => {
                    const accNorm = normalize(b.name);
                    if (accNorm === txAccountNorm) matchingIndices.push(i);
                });

                if (matchingIndices.length === 0) {
                    idx = -1;
                }
                else if (matchingIndices.length === 1) idx = matchingIndices[0];
                else {
                    const bestMatch = matchingIndices.find(i => balances[i].balance_date);
                    idx = bestMatch !== undefined ? bestMatch : matchingIndices[0];
                }

                // Dynamic Account Creation
                if (idx === -1 && useDynamicAccounts) {
                    const { type, currency } = inferAccountDetails(t.account, t.originalCurrency);
                    balances.push({
                        id: normalize(t.account),
                        name: t.account,
                        currency: currency || 'THB',
                        initial: 0,
                        type: type || 'cash',
                        current: 0,
                        rubEquivalent: 0,
                    });
                    idx = balances.length - 1;
                }

                // APPLY TO SOURCE
                if (idx !== -1) {
                    const sourceAccount = balances[idx];

                    const shouldApply = shouldApplyToAccount(sourceAccount, t);

                    if (shouldApply) {
                        // Determine which amount to use:
                        // If account currency matches original transaction currency, use originalAmount (e.g. USDT)
                        // Otherwise use the default amount (which is usually converted or primary)
                        let txAmount = t.amount;
                        const accountCurrency = (sourceAccount.currency || '').trim().toUpperCase();
                        const txOriginalCurrency = (t.originalCurrency || '').trim().toUpperCase();

                        if (accountCurrency !== 'RUB' &&
                            txOriginalCurrency === accountCurrency &&
                            t.originalAmount) {
                            txAmount = t.originalAmount;
                        }

                        // Apply to Current Balance
                        sourceAccount.current += txAmount;

                        // Debug RUB account - WIDENED FILTER
                        // if (sourceAccount.name.toLowerCase().includes('rub')) {
                        //     console.log(`[RUB DEBUG] ${sourceAccount.name} | ${t.date} | ${t.type} | Amount: ${txAmount} | NewBalance: ${sourceAccount.current} | ID: ${t.id} | Note: ${t.note}`);
                        // }

                        // // DEBUG 100k
                        // if (sourceAccount.name.toLowerCase().includes('bybit') || sourceAccount.name.toLowerCase().includes('usdt')) {
                        //     console.log(`[100k Debug] Applied ${t.type} ${txAmount} (ID: ${t.id}, Date: ${t.date}, Note: ${t.note}). New Balance: ${sourceAccount.current}`);
                        // }
                        // if (Math.abs(txAmount - 100000) < 1) {
                        //     console.log(`[100k Debug] FOUND THE 100k TRANSACTION! Account: ${sourceAccount.name}, Date: ${t.date}, Note: ${t.note}, ID: ${t.id}`);
                        // }
                    }
                    // else if (sourceAccount.name.toLowerCase().includes('bybit') || sourceAccount.name.toLowerCase().includes('usdt')) {
                    //     console.log(`[100k Debug] Skipped ${t.type} ${t.amount} (ID: ${t.id}, Date: ${t.date}, CheckpointID: ${sourceAccount.balance_checkpoint_tx_id})`);
                    // }
                }

                // APPLY TO DESTINATION (Transfers)
                if (t.type === 'transfer') {
                    const destName = t.category;
                    if (destName && destName !== 'Uncategorized') {
                        // Find Dest Account using same matching logic
                        const destNorm = normalize(destName);
                        let destIdx = -1;
                        const destMatches: number[] = [];
                        balances.forEach((b, i) => {
                            if (normalize(b.name) === destNorm) destMatches.push(i);
                        });

                        if (destMatches.length === 1) destIdx = destMatches[0];
                        else if (destMatches.length > 1) {
                            const best = destMatches.find(i => balances[i].balance_date);
                            destIdx = best !== undefined ? best : destMatches[0];
                        }

                        // Dynamic Account Creation for DESTINATION
                        // Allows creating 'Btc' or other wallets that only receive funds even if not in DB list
                        if (destIdx === -1) {
                            const { type, currency } = inferAccountDetails(destName, t.originalCurrency);
                            balances.push({
                                id: normalize(destName),
                                name: destName,
                                currency: currency || 'THB',
                                initial: 0,
                                type: type || 'cash',
                                current: 0,
                                rubEquivalent: 0,
                            });
                            destIdx = balances.length - 1;
                        }

                        if (destIdx !== -1) {
                            const destAccount = balances[destIdx];
                            // CRITICAL: Check checkpoint for DESTINATION too
                            if (shouldApplyToAccount(destAccount, t)) {
                                const creditAmount = Math.abs((t.originalAmount && t.originalAmount > 0) ? t.originalAmount : t.amount);
                                destAccount.current += creditAmount;
                            }
                        }
                    }
                }
            });
        }

        balances.forEach(b => {
            const rate = rates[b.currency] || DEFAULT_RATES[b.currency] || 1;
            b.rubEquivalent = b.current * rate;
        });

        return balances;
    }, [transactions, rates, dbAccounts]);

    const totalNetWorth = useMemo(() => {
        return accounts.reduce((acc, curr) => acc + curr.rubEquivalent, 0);
    }, [accounts]);

    return {
        accounts,
        totalNetWorth,
        rates,
        isLoadingRates,
        isLiveRates,
        refreshAccounts: fetchSupabaseAccounts
    };
}
