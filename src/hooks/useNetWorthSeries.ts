import { useMemo } from 'react';
import type { Transaction } from '../types';
import { useHistoricalRates } from './useHistoricalRates';
import { makeRateLookup } from '../lib/fxBenchmark';
import { netWorthSeries, readWalletHistory, sampleDays, type NetWorthPoint } from '../lib/netWorth';

/**
 * Net worth week by week from the wallet history a backup import stored (lib/netWorth), every
 * wallet at that week's rate. Shared by the Wallets chart and the Goals page, so both draw the
 * same line. `history` is null after an Excel import, which has no balances.
 */
export function useNetWorthSeries(transactions: Transaction[], liveRates: Record<string, number>) {
    // Read again whenever the statement changes: a backup import writes it first.
    const history = useMemo(() => (transactions.length ? readWalletHistory() : null), [transactions]);
    const lastDay = history?.asOf.slice(0, 10) ?? '';
    const firstDay = useMemo(() => history?.wallets.map(w => w.history[0]?.[0]).filter(Boolean).sort()[0] ?? '', [history]);
    const days = useMemo(() => (firstDay && lastDay ? sampleDays(firstDay, lastDay) : []), [firstDay, lastDay]);
    const codes = useMemo(() => [...new Set(history?.wallets.filter(w => !w.archived).map(w => w.currency) ?? [])].filter(c => c !== 'RUB').sort(), [history]);

    const reference = useHistoricalRates(days, codes);
    const rateOn = useMemo(() => makeRateLookup(reference.snapshots, { rates: liveRates, date: null }), [reference.snapshots, liveRates]);
    const { points, unvalued } = useMemo(
        () => (history ? netWorthSeries(history, days, rateOn) : { points: [] as NetWorthPoint[], unvalued: [] as string[] }),
        [history, days, rateOn]
    );

    return {
        history,
        firstDay,
        lastDay,
        points,
        unvalued,
        isLoading: reference.isLoading,
        weeks: days.length,
        weeksLoaded: days.filter(d => reference.snapshots[d]).length,
    };
}
