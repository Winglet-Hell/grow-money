import { useState, useEffect, useMemo } from 'react';
import type { Transaction } from '../types';

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

const INITIAL_BALANCES: AccountConfig[] = [
    { id: 'tm', name: 'TrueMoney', currency: 'THB', initial: 8934, type: 'wallet' },
    { id: 'usdt', name: 'USDT Bybit', currency: 'USDT', initial: 2294, type: 'crypto' },
    { id: 'rub', name: 'RUB', currency: 'RUB', initial: 1440000, type: 'bank' },
    { id: 'thb_wallet', name: 'THB Wallet', currency: 'THB', initial: 9016, type: 'cash' },
    { id: 'redot', name: 'RedotPay', currency: 'USDT', initial: 9.91, type: 'card' },
    // New accounts found from transactions
    { id: 'deep_pocket', name: 'Deep pocket', currency: 'THB', initial: 712, type: 'cash' },
    { id: 'thb_cash', name: 'THB Cash', currency: 'THB', initial: 0, type: 'cash' },
    { id: 'myr_wallet', name: 'MYR Wallet', currency: 'MYR', initial: 0, type: 'cash' },
    { id: 'hkd_wallet', name: 'HKD wallet', currency: 'HKD', initial: 0, type: 'cash' },
    { id: 'tagthai', name: 'TagThai', currency: 'THB', initial: 0, type: 'wallet' },
    { id: 'usd_cash', name: 'USD Cash', currency: 'USD', initial: 2400, type: 'cash' },
    { id: 'btc_wallet', name: 'Bitcoin Wallet', currency: 'BTC', initial: 0.14675181, type: 'crypto' },
];

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
    const [isLoadingRates, setIsLoadingRates] = useState(false);
    const [isLiveRates, setIsLiveRates] = useState(false);

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
        const balances = INITIAL_BALANCES.map(acc => ({
            ...acc,
            current: acc.initial,
            rubEquivalent: 0
        }));

        const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '');

        transactions.forEach(t => {
            if (new Date(t.date) <= ANCHOR_DATE) return;

            let idx = balances.findIndex(b => normalize(b.name) === normalize(t.account));

            if (idx === -1) {
                const newAccount: AccountStatus = {
                    id: normalize(t.account),
                    name: t.account,
                    currency: 'THB',
                    initial: 0,
                    type: 'cash',
                    current: 0,
                    rubEquivalent: 0
                };

                if (t.account.toLowerCase().includes('usd')) { newAccount.currency = 'USD'; }
                if (t.account.toLowerCase().includes('eur')) { newAccount.currency = 'EUR'; }
                if (t.account.toLowerCase().includes('btc') || t.account.toLowerCase().includes('bitcoin')) {
                    newAccount.currency = 'BTC';
                    newAccount.type = 'crypto';
                }

                balances.push(newAccount);
                idx = balances.length - 1;
            }

            if (idx !== -1) {
                if (t.type === 'income') {
                    balances[idx].current += t.amount;
                } else if (t.type === 'expense') {
                    if (t.amount > 0) {
                        balances[idx].current -= t.amount;
                    } else {
                        balances[idx].current += t.amount;
                    }
                } else if (t.type === 'transfer') {
                    if (t.amount > 0) {
                        balances[idx].current -= t.amount;
                    } else {
                        balances[idx].current += t.amount;
                    }

                    const destName = t.category;
                    if (destName && destName !== 'Uncategorized') {
                        let destIdx = balances.findIndex(b => normalize(b.name) === normalize(destName));

                        if (destIdx === -1) {
                            const newDest: AccountStatus = {
                                id: normalize(destName),
                                name: destName,
                                currency: t.originalCurrency || balances[idx].currency || 'THB',
                                initial: 0,
                                type: 'cash',
                                current: 0,
                                rubEquivalent: 0
                            };
                            if (destName.toLowerCase().includes('usd')) newDest.currency = 'USD';
                            if (destName.toLowerCase().includes('rub')) newDest.currency = 'RUB';
                            if (destName.toLowerCase().includes('btc')) { newDest.currency = 'BTC'; newDest.type = 'crypto'; }
                            if (t.originalCurrency) newDest.currency = t.originalCurrency;

                            balances.push(newDest);
                            destIdx = balances.length - 1;
                        }

                        const creditAmount = (t.originalAmount && t.originalAmount > 0)
                            ? t.originalAmount
                            : t.amount;

                        if (creditAmount > 0) {
                            balances[destIdx].current += creditAmount;
                        } else {
                            balances[destIdx].current -= creditAmount;
                        }
                    }
                }
            }
        });

        balances.forEach(b => {
            const rate = rates[b.currency] || DEFAULT_RATES[b.currency] || 1;
            b.rubEquivalent = b.current * rate;
        });

        return balances;
    }, [transactions, rates]);

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
