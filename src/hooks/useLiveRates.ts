import { useEffect, useState } from 'react';
import { fetchLiveRates, getCachedLiveRates } from '../lib/liveRates';

// Today's rates as "RUB per 1 unit of CODE" keyed by upper-case code, so a pair's rate is
// simply rates[base] / rates[quote]. The download itself is shared with useAccounts
// (see lib/liveRates) — one request per session, not one per page.

export interface LiveRates {
    rates: Record<string, number>; // RUB per 1 unit of CODE (e.g. rates.USDT ≈ 78)
    date: string | null;           // API snapshot date, "YYYY-MM-DD"
    isLive: boolean;               // true once a successful fetch has populated rates
    isLoading: boolean;
}

export function useLiveRates(): LiveRates {
    const cached = getCachedLiveRates();
    const [rates, setRates] = useState<Record<string, number>>(() => cached?.rates ?? {});
    const [date, setDate] = useState<string | null>(() => cached?.date ?? null);
    const [isLive, setIsLive] = useState(!!cached);
    const [isLoading, setIsLoading] = useState(!cached);

    useEffect(() => {
        let cancelled = false;
        fetchLiveRates().then(snapshot => {
            if (cancelled) return;
            if (snapshot) {
                setRates(snapshot.rates);
                setDate(snapshot.date);
                setIsLive(true);
            } else {
                setIsLive(false);
            }
            setIsLoading(false);
        });
        return () => { cancelled = true; };
    }, []);

    return { rates, date, isLive, isLoading };
}
