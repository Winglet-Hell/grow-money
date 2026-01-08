import { useState, useEffect, useMemo } from 'react';
import type { Transaction, Account } from '../types';
import { supabase } from '../lib/supabase';

export interface AccountConfig {
    id: string;
    name: string;
    currency: string;
    initial: number;
    type: 'wallet' | 'crypto' | 'bank' | 'cash' | 'card';
}

export interface AccountStatus extends AccountConfig {
    current: number;
    rubEquivalent: number;
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
    useEffect(() => {
        const fetchAccounts = async () => {
            const { data: { user } } = await supabase.auth.getUser();

            let query = supabase.from('accounts').select('*');

            if (user) {
                query = query.eq('user_id', user.id);
            } else {
                query = query.is('user_id', null);
            }

            const { data, error } = await query;
            if (data) {
                setDbAccounts(data);
            }
        };

        fetchAccounts();
    }, [transactions]);

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

    const accounts = useMemo(() => {
        const balances: AccountStatus[] = [];
        const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '');

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
                    rubEquivalent: 0
                });
            });
        }

        // 2. Process Transactions to update balances
        // If NO DB accounts, we generate dynamic ones on the fly (Hybrid/Legacy mode)
        const useDynamicAccounts = dbAccounts.length === 0;

        if (Array.isArray(transactions)) {
            transactions.forEach(t => {
                if (new Date(t.date) <= ANCHOR_DATE && useDynamicAccounts) return;

                let idx = balances.findIndex(b => normalize(b.name) === normalize(t.account));

                // Create Dynamic Account if needed
                if (idx === -1 && useDynamicAccounts) {
                    const newAccount: AccountStatus = {
                        id: normalize(t.account),
                        name: t.account,
                        currency: 'THB', // Default, inferred below
                        initial: 0,
                        type: 'cash',
                        current: 0,
                        rubEquivalent: 0
                    };

                    // Infer logic
                    const lowerName = t.account.toLowerCase();
                    if (lowerName.includes('usd')) { newAccount.currency = 'USD'; }
                    else if (lowerName.includes('eur')) { newAccount.currency = 'EUR'; }
                    else if (lowerName.includes('rub') || lowerName.includes('main')) { newAccount.currency = 'RUB'; newAccount.type = 'bank'; }
                    else if (lowerName.includes('btc')) { newAccount.currency = 'BTC'; newAccount.type = 'crypto'; }
                    else if (lowerName.includes('usdt')) { newAccount.currency = 'USDT'; newAccount.type = 'crypto'; }

                    balances.push(newAccount);
                    idx = balances.length - 1;
                }

                // Apply Transaction (Only if account exists or was just created)
                if (idx !== -1) {
                    // Prevent double counting the "Initial Balance" transaction if we already used DB Initial Balance
                    const noteLower = (t.note || '').toLowerCase();
                    const isInitialTx = noteLower.includes('initial balance') || noteLower.includes('start balance');

                    if (isInitialTx && !useDynamicAccounts) {
                        return; // Skip
                    }

                    if (t.type === 'income') {
                        balances[idx].current += t.amount;
                    } else if (t.type === 'expense') {
                        balances[idx].current -= Math.abs(t.amount);
                    } else if (t.type === 'transfer') {
                        balances[idx].current -= Math.abs(t.amount);

                        // Destination Logic
                        const destName = t.category;
                        if (destName && destName !== 'Uncategorized') {
                            let destIdx = balances.findIndex(b => normalize(b.name) === normalize(destName));

                            if (destIdx === -1 && useDynamicAccounts) {
                                // Create dest account dynamcially logic if needed...
                            }

                            if (destIdx !== -1) {
                                const creditAmount = (t.originalAmount && t.originalAmount > 0) ? t.originalAmount : t.amount;
                                balances[destIdx].current += creditAmount;
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
        isLiveRates
    };
}
