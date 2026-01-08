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

        const { data } = await query.order('created_at', { ascending: true });
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
        const accountMap = new Map<string, number>(); // Name -> Index in balances

        if (dbAccounts.length > 0) {
            dbAccounts.forEach(acc => {
                const idx = balances.length;
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
                accountMap.set(normalize(acc.name), idx);
            });
        }

        if (Array.isArray(transactions) && transactions.length > 0) {
            // Sort transactions: Oldest -> Newest
            // We use slice() to avoid mutating the original array if it's not already a copy
            const sorted = [...transactions].sort((a, b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return (b.index || 0) - (a.index || 0);
            });

            // Pre-parse checkpoint dates to avoid repeated split/parsing
            const accountCheckpoints = balances.map(acc => {
                if (!acc.balance_date) return null;
                return acc.balance_date.split('T')[0];
            });

            const shouldApplyToAccount = (account: AccountStatus, t: Transaction, accIdx: number): boolean => {
                const checkpointDateStr = accountCheckpoints[accIdx];
                if (checkpointDateStr) {
                    const txDateStr = t.date;
                    if (txDateStr < checkpointDateStr) return false;
                    if (txDateStr > checkpointDateStr) return true;

                    // Same Date
                    if (account.balance_checkpoint_tx_id) {
                        if (account.hasPassedCheckpoint) return true;
                        if (t.id === account.balance_checkpoint_tx_id) {
                            account.hasPassedCheckpoint = true;
                            return false;
                        }
                        return false;
                    }
                    return false;
                } else {
                    if (new Date(t.date) <= ANCHOR_DATE && useDynamicAccounts) return false;
                }

                const noteLower = (t.note || '').toLowerCase();
                const isInitialTx = noteLower.includes('initial balance') || noteLower.includes('start balance');
                if (isInitialTx && !useDynamicAccounts && Math.abs(account.initial) > 0.01) {
                    return false;
                }

                return true;
            };

            sorted.forEach(t => {
                const txAccountNorm = normalize(t.account);
                let idx = accountMap.has(txAccountNorm) ? accountMap.get(txAccountNorm)! : -1;

                // Dynamic Account Creation
                if (idx === -1 && useDynamicAccounts) {
                    const { type, currency } = inferAccountDetails(t.account, t.originalCurrency);
                    idx = balances.length;
                    balances.push({
                        id: normalize(t.account),
                        name: t.account,
                        currency: currency || 'THB',
                        initial: 0,
                        type: type || 'cash',
                        current: 0,
                        rubEquivalent: 0,
                    });
                    accountMap.set(txAccountNorm, idx);
                }

                // APPLY TO SOURCE
                if (idx !== -1) {
                    const sourceAccount = balances[idx];
                    if (shouldApplyToAccount(sourceAccount, t, idx)) {
                        let txAmount = t.amount;
                        const accountCurrency = (sourceAccount.currency || '').trim().toUpperCase();
                        const txOriginalCurrency = (t.originalCurrency || '').trim().toUpperCase();

                        if (accountCurrency !== 'RUB' &&
                            txOriginalCurrency === accountCurrency &&
                            t.originalAmount) {
                            txAmount = t.originalAmount;
                        }
                        sourceAccount.current += txAmount;
                    }
                }

                // APPLY TO DESTINATION (Transfers)
                if (t.type === 'transfer' && t.category && t.category !== 'Uncategorized') {
                    const destNorm = normalize(t.category);
                    let destIdx = accountMap.has(destNorm) ? accountMap.get(destNorm)! : -1;

                    if (destIdx === -1 && useDynamicAccounts) {
                        const { type, currency } = inferAccountDetails(t.category, t.originalCurrency);
                        destIdx = balances.length;
                        balances.push({
                            id: destNorm,
                            name: t.category,
                            currency: currency || 'THB',
                            initial: 0,
                            type: type || 'cash',
                            current: 0,
                            rubEquivalent: 0,
                        });
                        accountMap.set(destNorm, destIdx);
                    }

                    if (destIdx !== -1) {
                        const destAccount = balances[destIdx];
                        if (shouldApplyToAccount(destAccount, t, destIdx)) {
                            const creditAmount = Math.abs((t.originalAmount && t.originalAmount > 0) ? t.originalAmount : t.amount);
                            destAccount.current += creditAmount;
                        }
                    }
                }
            });
        }

        balances.forEach(b => {
            const rate = rates[b.currency] || DEFAULT_RATES[b.currency] || 1;
            b.rubEquivalent = b.current * rate;
        });

        balances.sort((a, b) => a.name.localeCompare(b.name));
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
