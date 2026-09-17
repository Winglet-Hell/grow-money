import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Transaction, Account } from '../types';
import { inferAccountDetails } from '../lib/accountUtils';
import { loadCurrencyCatalogue } from '../lib/currencies';
import { fetchLiveRates, getCachedLiveRates } from '../lib/liveRates';
import { getCachedAccounts, loadAccounts, invalidateAccounts, subscribeAccounts } from '../lib/accountsStore';

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
    isStored: boolean; // has a DB row (discovered-only accounts get one on first save)
    // Activity from the imported operations — the one clue to whether a manual balance is stale.
    txCount: number;
    lastActivity: string | null;   // newest operation touching this account ("YYYY-MM-DD")
    txSinceBalance: number;        // operations dated after the balance was last entered
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

// Live rates on top of the offline fallbacks, so an unknown code still has a value.
const withDefaults = (live: Record<string, number>) => ({ ...DEFAULT_RATES, ...live });

export function useAccounts(transactions: Transaction[]) {
    // Both caches are shared across pages (see lib/liveRates and lib/accountsStore), so
    // the second page to mount starts with the numbers already in hand.
    const cachedRates = getCachedLiveRates();
    const [rates, setRates] = useState<Record<string, number>>(() => cachedRates ? withDefaults(cachedRates.rates) : DEFAULT_RATES);
    const [isLiveRates, setIsLiveRates] = useState(!!cachedRates);
    const [isLoadingRates, setIsLoadingRates] = useState(!cachedRates);
    const [dbAccounts, setDbAccounts] = useState<Account[]>(() => getCachedAccounts() ?? []);

    // Accounts: load once, then follow the store — every save/delete/merge/import goes
    // through invalidateAccounts(), which re-queries and pushes to all mounted hooks.
    useEffect(() => {
        let cancelled = false;
        const unsubscribe = subscribeAccounts(() => {
            const next = getCachedAccounts();
            if (!cancelled && next) setDbAccounts(next);
        });
        loadAccounts().then(next => { if (!cancelled) setDbAccounts(next); });
        return () => { cancelled = true; unsubscribe(); };
    }, []);

    const fetchSupabaseAccounts = useCallback(async () => {
        const next = await invalidateAccounts();
        setDbAccounts(next);
    }, []);

    // Rates: one download per session, shared.
    useEffect(() => {
        let cancelled = false;
        // isLoadingRates already starts true when nothing is cached (see useState above).
        fetchLiveRates().then(snapshot => {
            if (cancelled) return;
            if (snapshot) {
                setRates(withDefaults(snapshot.rates));
                setIsLiveRates(true);
            } else {
                setIsLiveRates(false);
            }
            setIsLoadingRates(false);
        });
        // Codes + display names for the currency pickers.
        loadCurrencyCatalogue();
        return () => { cancelled = true; };
    }, []);

    // Wallet balances are entered MANUALLY and stored in the DB — that is the single
    // source of truth. Transactions do NOT move these numbers: the export has no starting
    // balances and no manual corrections, so deriving a running balance is unreliable.
    // Transactions are used here only to surface account *names* that don't have a row yet.
    const accounts = useMemo(() => {
        const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '');
        const byKey = new Map<string, AccountStatus>();

        // Operations per account: the source account of every row plus the destination
        // leg of transfers. Dates are compared as "YYYY-MM-DD" strings.
        const activity = new Map<string, { count: number; last: string | null; dates: string[] }>();
        const touch = (name: string | undefined, date: string) => {
            if (!name) return;
            const key = normalize(name);
            const a = activity.get(key) ?? { count: 0, last: null, dates: [] };
            a.count += 1;
            const day = date.slice(0, 10);
            a.dates.push(day);
            if (!a.last || day > a.last) a.last = day;
            activity.set(key, a);
        };
        if (Array.isArray(transactions)) {
            transactions.forEach(t => {
                touch(t.account, t.date);
                if (t.type === 'transfer') touch(t.category, t.date);
            });
        }
        const activityOf = (key: string, balanceDate?: string) => {
            const a = activity.get(key);
            if (!a) return { txCount: 0, lastActivity: null, txSinceBalance: 0 };
            const since = balanceDate ? balanceDate.slice(0, 10) : null;
            return {
                txCount: a.count,
                lastActivity: a.last,
                // Without a date there is nothing to compare against; the card says so instead.
                txSinceBalance: since ? a.dates.filter(d => d > since).length : 0,
            };
        };

        // 1. DB accounts — the manually maintained balances.
        dbAccounts.forEach(acc => {
            const key = normalize(acc.name);
            byKey.set(key, {
                id: acc.id || key,
                name: acc.name,
                currency: acc.currency,
                type: acc.type,
                initial: acc.balance,
                current: acc.balance,
                rubEquivalent: 0,
                hasRate: true, // recomputed below, once the rate table is consulted
                balance_date: acc.balance_date,
                isStored: !!acc.id,
                ...activityOf(key, acc.balance_date),
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
                    isStored: false,
                    ...activityOf(key),
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
