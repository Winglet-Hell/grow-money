import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Transaction, Account } from '../types';
import { accountStatuses, netWorthOf, withDefaultRates, DEFAULT_RATES } from '../lib/accountStatus';
import { loadCurrencyCatalogue } from '../lib/currencies';
import { fetchLiveRates, getCachedLiveRates } from '../lib/liveRates';
import { getCachedAccounts, loadAccounts, invalidateAccounts, subscribeAccounts } from '../lib/accountsStore';

export type { AccountConfig, AccountStatus } from '../lib/accountStatus';

export function useAccounts(transactions: Transaction[]) {
    // Both caches are shared across pages (see lib/liveRates and lib/accountsStore), so
    // the second page to mount starts with the numbers already in hand.
    const cachedRates = getCachedLiveRates();
    const [rates, setRates] = useState<Record<string, number>>(() => cachedRates ? withDefaultRates(cachedRates.rates) : DEFAULT_RATES);
    const [isLiveRates, setIsLiveRates] = useState(!!cachedRates);
    const [isLoadingRates, setIsLoadingRates] = useState(!cachedRates);
    const [dbAccounts, setDbAccounts] = useState<Account[]>(() => getCachedAccounts() ?? []);
    // True until the stored wallets have arrived once; until then every total reads 0.
    const [isLoadingAccounts, setIsLoadingAccounts] = useState(() => getCachedAccounts() === null);

    // Accounts: load once, then follow the store — every save/delete/merge/import goes
    // through invalidateAccounts(), which re-queries and pushes to all mounted hooks.
    useEffect(() => {
        let cancelled = false;
        const unsubscribe = subscribeAccounts(() => {
            const next = getCachedAccounts();
            if (!cancelled && next) { setDbAccounts(next); setIsLoadingAccounts(false); }
        });
        loadAccounts().then(next => { if (!cancelled) { setDbAccounts(next); setIsLoadingAccounts(false); } });
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
                setRates(withDefaultRates(snapshot.rates));
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

    // The stored wallets valued at today's rates, plus the names only the operations know (lib/accountStatus).
    const accounts = useMemo(() => accountStatuses(dbAccounts, transactions, rates), [transactions, rates, dbAccounts]);

    const totalNetWorth = useMemo(() => netWorthOf(accounts), [accounts]);

    return {
        accounts,
        totalNetWorth,
        rates,
        isLoadingRates,
        isLoadingAccounts,
        isLiveRates,
        refreshAccounts: fetchSupabaseAccounts
    };
}
