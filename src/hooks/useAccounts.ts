import { useState, useEffect, useMemo } from 'react';
import type { Transaction, Account } from '../types';
import { supabase } from '../lib/supabase';
import { inferAccountDetails } from '../lib/accountUtils';
import { registerRateCodes, loadCurrencyCatalogue } from '../lib/currencies';

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
    hasRate: boolean; // false when no RUB rate is known, so the balance cannot be valued
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

                    // Stablecoins are occasionally absent — fall back to USD parity.
                    if (newRates['USD']) {
                        if (!newRates['USDT']) newRates['USDT'] = newRates['USD'];
                        if (!newRates['USDC']) newRates['USDC'] = newRates['USD'];
                    }

                    // Let the shared catalogue know which codes can actually be valued.
                    registerRateCodes(Object.keys(newRates));

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
        // Codes + display names for the currency pickers.
        loadCurrencyCatalogue();
    }, []);

    // Wallet balances are entered MANUALLY and stored in the DB — that is the single
    // source of truth. Transactions do NOT move these numbers: the export has no starting
    // balances and no manual corrections, so deriving a running balance is unreliable.
    // Transactions are used here only to surface account *names* that don't have a row yet.
    const accounts = useMemo(() => {
        const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '');
        const byKey = new Map<string, AccountStatus>();

        // 1. DB accounts — the manually maintained balances.
        dbAccounts.forEach(acc => {
            byKey.set(normalize(acc.name), {
                id: acc.id || normalize(acc.name),
                name: acc.name,
                currency: acc.currency,
                type: acc.type,
                initial: acc.balance,
                current: acc.balance,
                rubEquivalent: 0,
                hasRate: true, // recomputed below, once the rate table is consulted
                balance_date: acc.balance_date,
            });
        });

        // 2. Accounts seen in transactions but not yet in the DB — shown ready for a
        //    balance to be set. They stay at 0 until you enter a number (which creates
        //    the DB row via the edit dialog).
        if (Array.isArray(transactions)) {
            const consider = (name: string | undefined, detectedCurrency?: string) => {
                if (!name) return;
                const key = normalize(name);
                if (!key || key === 'unknown' || key === 'uncategorized' || byKey.has(key)) return;
                const { type, currency } = inferAccountDetails(name, detectedCurrency);
                byKey.set(key, {
                    id: key,
                    name,
                    currency: currency || 'RUB',
                    type: type || 'cash',
                    initial: 0,
                    current: 0,
                    rubEquivalent: 0,
                    hasRate: true, // recomputed below, once the rate table is consulted
                });
            };
            transactions.forEach(t => {
                consider(t.account, t.fromCurrency || t.originalCurrency || t.currency);
                if (t.type === 'transfer') consider(t.category, t.toCurrency || t.originalCurrency);
            });
        }

        const balances = Array.from(byKey.values());
        balances.forEach(b => {
            const rate = b.currency === 'RUB'
                ? 1
                : rates[b.currency] ?? DEFAULT_RATES[b.currency];
            // An unknown currency used to be valued 1:1 against the ruble, which quietly
            // fed a wrong number into net worth. Leave it unvalued and say so instead.
            b.hasRate = typeof rate === 'number' && rate > 0;
            b.rubEquivalent = b.hasRate ? b.current * rate! : 0;
        });
        // Largest first (by RUB value, the only cross-currency comparable); ties by name.
        balances.sort((a, b) => (b.rubEquivalent - a.rubEquivalent) || a.name.localeCompare(b.name));
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
