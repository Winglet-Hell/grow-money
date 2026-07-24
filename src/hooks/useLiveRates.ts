import { useEffect, useState } from 'react';

// Free, no-key, CORS-enabled daily rates (fiat + crypto), already used for wallet
// valuation in useAccounts. Returns "RUB per 1 unit of CODE" keyed by upper-case code,
// so a pair's rate is simply rates[base] / rates[quote].
const RATES_URL = 'https://latest.currency-api.pages.dev/v1/currencies/rub.json';

export interface LiveRates {
    rates: Record<string, number>; // RUB per 1 unit of CODE (e.g. rates.USDT ≈ 78)
    date: string | null;           // API snapshot date, "YYYY-MM-DD"
    isLive: boolean;               // true once a successful fetch has populated rates
    isLoading: boolean;
}

export function useLiveRates(): LiveRates {
    const [rates, setRates] = useState<Record<string, number>>({});
    const [date, setDate] = useState<string | null>(null);
    const [isLive, setIsLive] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setIsLoading(true);
            try {
                const res = await fetch(RATES_URL);
                const data = await res.json();
                if (cancelled) return;

                // data.rub[code] = units of CODE per 1 RUB → invert to RUB per CODE.
                if (data && data.rub) {
                    const next: Record<string, number> = {};
                    for (const [code, perRub] of Object.entries(data.rub as Record<string, number>)) {
                        if (typeof perRub === 'number' && perRub > 0) {
                            next[code.toUpperCase()] = 1 / perRub;
                        }
                    }
                    // Stablecoins occasionally missing — fall back to USD parity.
                    if (next.USD && !next.USDT) next.USDT = next.USD;
                    if (next.USD && !next.USDC) next.USDC = next.USD;

                    setRates(next);
                    setDate(typeof data.date === 'string' ? data.date : null);
                    setIsLive(true);
                }
            } catch (err) {
                if (!cancelled) {
                    console.error('Failed to fetch live rates:', err);
                    setIsLive(false);
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    return { rates, date, isLive, isLoading };
}
