import React, { useMemo, useState } from 'react';
import type { Transaction } from '../types';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../components/ui/table";
import {
    ArrowRightLeft,
    ArrowRight,
    ArrowUpDown,
    Search,
    X,
    Coins,
    Repeat,
    Layers,
    Info,
    TrendingUp,
    TrendingDown,
    HandCoins,
} from 'lucide-react';
import { formatDate, getFormattedDateRange } from '../lib/utils';
import { usePrivacy } from '../contexts/PrivacyContext';
import { useLiveRates } from '../hooks/useLiveRates';
import { useHistoricalRates } from '../hooks/useHistoricalRates';
import {
    FIRST_SNAPSHOT_DATE,
    IMPLAUSIBLE_CUT_PCT,
    isCrossCurrencyTransfer,
    isImplausibleCut,
    makeRateLookup,
    benchmarkConversion,
} from '../lib/fxBenchmark';

interface CurrencyRatesPageProps {
    transactions: Transaction[];
}

// A single cross-currency exchange, normalised to the pair's display direction.
interface Observation {
    date: string;
    index: number;
    rate: number;          // quote units per 1 base unit
    fromAccount: string;
    toAccount: string;
    fromAmount: number;
    fromCurrency: string;
    toAmount: number;
    toCurrency: string;
}

interface PairStat {
    key: string;           // "RUB>USDT": source > destination, one row per direction
    // Rate quotation direction (kept readable: 1 base = rate quote, rate >= 1).
    base: string;
    quote: string;
    // Actual money-flow direction (what you spend -> what you receive).
    from: string;
    to: string;
    avgRate: number;       // simple mean of per-transfer rates (quote per base)
    weightedRate: number;  // volume weighted: total quote / total base
    minRate: number;
    maxRate: number;
    lastRate: number;
    lastDate: string;
    count: number;
    fromVolume: number;    // gross volume in the source currency
    toVolume: number;      // gross volume in the destination currency
    observations: Observation[];
}

// One exchange measured against the market (reference) rate of its day. Both sides are
// valued in RUB at that day's rates, so "what you sent" vs "what you got back" is a
// like-for-like comparison whatever the pair.
interface ObsBenchmark {
    marketRate: number;   // that day's reference rate, quote per base
    vsMarketPct: number;  // (received − sent) / sent, in value terms; < 0 = the exchanger's cut
    lossRub: number;      // sent − received at that day's rates; > 0 = lost to the exchanger
    lossSent: number;     // the same, in the currency that was sent
}

interface PairBenchmark {
    covered: number;                  // exchanges that have a reference rate for their day
    vsMarketPct: number;              // volume-weighted across covered exchanges
    lossRub: number;
    lossFrom: number;                 // in the pair's source currency
    bestPct: number;                  // most favourable single exchange
    worstPct: number;                 // least favourable single exchange
    perObs: (ObsBenchmark | null)[];  // aligned with pair.observations
}

type SortField = 'pair' | 'avgRate' | 'count' | 'lastDate' | 'spread' | 'nowVsAvg' | 'vsMarket';
type SortOrder = 'asc' | 'desc';

const mean = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / (arr.length || 1);

// Signed percentage: "+0.4%" / "−1.8%".
const formatSignedPct = (pct: number) =>
    `${pct >= 0 ? '+' : '−'}${Math.abs(pct * 100).toFixed(1)}%`;

// Amount with decimals that suit its size (12,340 RUB / 0.85 USDT / 0.0012 BTC).
function formatAmount(v: number, currency: string): string {
    const abs = Math.abs(v);
    const digits = abs >= 100 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
    return `${v.toLocaleString('en-US', { maximumFractionDigits: digits })} ${currency}`;
}

// A loss (> 0) reads as "−12,340 RUB": what the exchanger kept; a gain as "+…".
const formatLoss = (loss: number, currency: string) =>
    `${loss > 0 ? '−' : '+'}${formatAmount(Math.abs(loss), currency)}`;

// How much more (or less) favourable the rate is RIGHT NOW versus your own historical
// average — i.e. is this a better moment to exchange than you usually get? > 0 → the
// current (baseline) rate beats your average; < 0 → it's worse. Direction depends on the
// quote: when the base is what you receive, a lower rate is cheaper (better); when the
// base is what you spend, a higher rate gets you more (better).
function nowVsAvgPct(pair: PairStat, baseline: number): number {
    if (!pair.avgRate || !isFinite(baseline)) return 0;
    const lowerIsBetter = pair.base === pair.to;
    const rawPct = (baseline - pair.avgRate) / pair.avgRate; // rate change: now vs your average
    return lowerIsBetter ? -rawPct : rawPct;
}

// Adaptive rate formatting — rates range from ~1 (USD/USDT) to ~100000 (BTC/USDT).
function formatRate(r: number): string {
    if (!isFinite(r) || isNaN(r)) return '—';
    if (r >= 1000) return r.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (r >= 1) return r.toLocaleString('en-US', { maximumFractionDigits: 4 });
    return r.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

// Tiny dependency-free sparkline of rate drift over time (oldest -> newest).
const Sparkline: React.FC<{ values: number[]; className?: string }> = ({ values, className }) => {
    if (values.length < 2) return null;
    const w = 96, h = 28, pad = 3;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pts = values.map((v, i) => {
        const x = pad + (i / (values.length - 1)) * (w - pad * 2);
        const y = h - pad - ((v - min) / span) * (h - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const last = values[values.length - 1];
    const first = values[0];
    const up = last >= first;
    return (
        <svg width={w} height={h} className={className} aria-hidden="true">
            <polyline
                points={pts.join(' ')}
                fill="none"
                stroke={up ? '#059669' : '#e11d48'}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
};

export const CurrencyRatesPage: React.FC<CurrencyRatesPageProps> = ({ transactions }) => {
    const { isPrivacyMode } = usePrivacy();
    const [sortField, setSortField] = useState<SortField>('count');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [searchQuery, setSearchQuery] = useState('');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const { pairs, totals, needsReimport, crossDates, crossCodes } = useMemo(() => {
        const allTransfers = transactions.filter(t => t.type === 'transfer');

        // Old data imported before the transfer-leg fields existed won't carry currencies.
        const hasLegData = allTransfers.some(t => t.fromCurrency || t.toCurrency);

        const cross = allTransfers.filter(isCrossCurrencyTransfer);

        // Group by direction — the actual money flow (source -> destination), so a pair reads
        // "I spend RUB to buy USDT". Buying a currency and selling the leftover back are two
        // deals on opposite sides of the market rate; averaged together they land in between,
        // looking better than either deal was, so the way back gets a row of its own.
        const groups = new Map<string, Transaction[]>();
        for (const t of cross) {
            const key = `${t.fromCurrency}|${t.toCurrency}`;
            const list = groups.get(key) || [];
            list.push(t);
            groups.set(key, list);
        }

        const pairs: PairStat[] = [];
        const currencySet = new Set<string>();

        for (const [key, list] of groups) {
            const [from, to] = key.split('|');
            currencySet.add(from);
            currencySet.add(to);

            // The rate number stays quoted the readable way (strong currency as base, >= 1),
            // e.g. "1 USD = 1487 KRW".
            const toPerFrom = list.map(t => t.toAmount! / t.fromAmount!);
            const [base, quote] = mean(toPerFrom) >= 1 ? [from, to] : [to, from];

            const rateOf = (t: Transaction) =>
                t.fromCurrency === base ? t.toAmount! / t.fromAmount! : t.fromAmount! / t.toAmount!;

            const observations: Observation[] = list.map(t => ({
                date: t.date,
                index: t.index ?? 0,
                rate: rateOf(t),
                fromAccount: t.account,
                toAccount: t.category,
                fromAmount: t.fromAmount!,
                fromCurrency: t.fromCurrency!,
                toAmount: t.toAmount!,
                toCurrency: t.toCurrency!,
            })).sort((x, y) =>
                x.date !== y.date ? y.date.localeCompare(x.date) : (x.index - y.index)
            );

            const rates = observations.map(o => o.rate);
            let baseVolume = 0;
            let quoteVolume = 0;
            for (const t of list) {
                if (t.fromCurrency === base) {
                    baseVolume += t.fromAmount!;
                    quoteVolume += t.toAmount!;
                } else {
                    baseVolume += t.toAmount!;
                    quoteVolume += t.fromAmount!;
                }
            }

            pairs.push({
                key: `${from}>${to}`,
                base,
                quote,
                from,
                to,
                avgRate: mean(rates),
                weightedRate: baseVolume > 0 ? quoteVolume / baseVolume : mean(rates),
                minRate: Math.min(...rates),
                maxRate: Math.max(...rates),
                lastRate: observations[0].rate,
                lastDate: observations[0].date,
                count: observations.length,
                fromVolume: from === base ? baseVolume : quoteVolume,
                toVolume: to === base ? baseVolume : quoteVolume,
                observations,
            });
        }

        return {
            pairs,
            totals: {
                totalTransfers: allTransfers.length,
                crossCount: cross.length,
                internalCount: allTransfers.length - cross.length,
                pairCount: pairs.length,
                currencyCount: currencySet.size,
            },
            needsReimport: allTransfers.length > 0 && !hasLegData,
            // What the per-day reference rates need to cover.
            crossDates: [...new Set(cross.map(t => t.date))].sort(),
            crossCodes: [...currencySet].sort(),
        };
    }, [transactions]);

    // Live "current" rates (same source the app uses to value wallets). A pair's market
    // rate is quote-per-base = (RUB per base) / (RUB per quote); null when uncovered.
    const { rates, date: ratesDate, isLoading: ratesLoading } = useLiveRates();
    const hasRates = Object.keys(rates).length > 0;
    const marketRate = (pair: PairStat): number | null => {
        const b = rates[pair.base];
        const q = rates[pair.quote];
        return b && q ? b / q : null;
    };
    // Baseline for the comparison: today's market rate, or the last transfer if unavailable.
    const baselineOf = (pair: PairStat): number => marketRate(pair) ?? pair.lastRate;

    // Reference rates for the day of each exchange — what the money would have been worth
    // at the market rate, so the gap to what you actually got is the exchanger's cut.
    const { snapshots, isLoading: historyLoading, missingDates } = useHistoricalRates(crossDates, crossCodes);

    const benchmarks = useMemo(() => {
        // The live snapshot stands in for days the feed has not published yet (today).
        const rateOn = makeRateLookup(snapshots, { rates, date: ratesDate });

        const byPair = new Map<string, PairBenchmark>();
        let totalSentRub = 0;
        let totalLossRub = 0;
        let totalCovered = 0;

        for (const pair of pairs) {
            let sentRub = 0, lossRub = 0, lossFrom = 0, covered = 0;
            let bestPct = -Infinity, worstPct = Infinity;

            const perObs = pair.observations.map<ObsBenchmark | null>(o => {
                const bm = benchmarkConversion(o.date, o.fromAmount, o.fromCurrency, o.toAmount, o.toCurrency, rateOn);
                if (!bm) return null;

                // Both currencies of the pair are one of the two legs.
                const rBase = o.fromCurrency === pair.base ? bm.rateFrom : bm.rateTo;
                const rQuote = o.fromCurrency === pair.quote ? bm.rateFrom : bm.rateTo;
                const rPairFrom = o.fromCurrency === pair.from ? bm.rateFrom : bm.rateTo;

                sentRub += bm.sentRub;
                lossRub += bm.lossRub;
                lossFrom += bm.lossRub / rPairFrom;
                covered++;
                bestPct = Math.max(bestPct, bm.vsMarketPct);
                worstPct = Math.min(worstPct, bm.vsMarketPct);

                return {
                    marketRate: rBase / rQuote,
                    vsMarketPct: bm.vsMarketPct,
                    lossRub: bm.lossRub,
                    lossSent: bm.lossRub / bm.rateFrom,
                };
            });

            if (covered === 0) continue;
            byPair.set(pair.key, {
                covered,
                vsMarketPct: -lossRub / sentRub,
                lossRub,
                lossFrom,
                bestPct,
                worstPct,
                perObs,
            });
            totalSentRub += sentRub;
            totalLossRub += lossRub;
            totalCovered += covered;
        }

        return {
            byPair,
            total: {
                covered: totalCovered,
                lossRub: totalLossRub,
                vsMarketPct: totalSentRub > 0 ? -totalLossRub / totalSentRub : 0,
            },
        };
    }, [pairs, snapshots, rates, ratesDate]);

    const filteredSorted = useMemo(() => {
        let data = [...pairs];

        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            data = data.filter(p =>
                p.base.toLowerCase().includes(q) ||
                p.quote.toLowerCase().includes(q) ||
                p.key.toLowerCase().includes(q)
            );
        }

        const dir = sortOrder === 'asc' ? 1 : -1;
        data.sort((a, b) => {
            switch (sortField) {
                case 'pair':
                    return a.key.localeCompare(b.key) * dir;
                case 'avgRate':
                    return (a.avgRate - b.avgRate) * dir;
                case 'lastDate':
                    return a.lastDate.localeCompare(b.lastDate) * dir;
                case 'spread': {
                    const sa = a.avgRate > 0 ? (a.maxRate - a.minRate) / a.avgRate : 0;
                    const sb = b.avgRate > 0 ? (b.maxRate - b.minRate) / b.avgRate : 0;
                    return (sa - sb) * dir;
                }
                case 'nowVsAvg':
                    return (nowVsAvgPct(a, baselineOf(a)) - nowVsAvgPct(b, baselineOf(b))) * dir;
                case 'vsMarket': {
                    // Pairs without a reference rate always sink to the bottom.
                    const va = benchmarks.byPair.get(a.key)?.vsMarketPct;
                    const vb = benchmarks.byPair.get(b.key)?.vsMarketPct;
                    if (va == null && vb == null) return 0;
                    if (va == null) return 1;
                    if (vb == null) return -1;
                    return (va - vb) * dir;
                }
                case 'count':
                default:
                    return (a.count - b.count) * dir;
            }
        });
        return data;
    }, [pairs, searchQuery, sortField, sortOrder, rates, benchmarks]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(o => (o === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder(field === 'pair' ? 'asc' : 'desc');
        }
    };

    const toggleExpand = (key: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    const maskVol = (v: number, currency: string) =>
        isPrivacyMode ? '••••' : `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;

    // How your historical average compares to the latest (most recent) rate — i.e. how
    // much more/less favourably you usually exchanged versus "now". Favourability depends
    // on the quote direction: when the base is what you receive, a lower rate is cheaper
    // (better); when the base is what you spend, a higher rate gets you more (better).
    // Market rate + how the historical average compares to it. Falls back to the last
    // transfer (marked with *) when the pair isn't covered by the live feed.
    const renderMarketInfo = (pair: PairStat, align: 'start' | 'end' = 'end') => {
        if (isPrivacyMode) return <span className="text-gray-300 text-xs">•••</span>;
        if (ratesLoading && !hasRates) return <span className="text-gray-300 text-xs">…</span>;

        const market = marketRate(pair);
        const baseline = market ?? pair.lastRate;
        if (!baseline || !isFinite(pair.avgRate)) return <span className="text-gray-300 text-xs">—</span>;

        const pct = nowVsAvgPct(pair, baseline);
        const negligible = !isFinite(pct) || Math.abs(pct) < 0.001;
        const better = pct > 0;
        const color = negligible ? 'text-gray-400' : better ? 'text-emerald-600' : 'text-rose-500';
        const items = align === 'end' ? 'items-end' : 'items-start';
        const title = market != null
            ? `The current rate is ${Math.abs(pct * 100).toFixed(1)}% ${negligible ? 'about the same as' : better ? 'better for you than' : 'worse for you than'} your average${ratesDate ? ` (as of ${ratesDate})` : ''}`
            : `Live market rate unavailable — showing your last transfer vs your average (${formatDate(pair.lastDate)})`;

        return (
            <div className={`flex flex-col ${items}`}>
                <div className="font-medium text-gray-700">
                    {formatRate(baseline)}
                    {market == null && <span className="text-gray-300" title="Live market rate unavailable — showing your last transfer">*</span>}
                </div>
                <div className={`text-[11px] font-medium flex items-center gap-0.5 ${color}`} title={title}>
                    {negligible
                        ? '≈ your avg'
                        : <>{better ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}{Math.abs(pct * 100).toFixed(1)}%</>}
                </div>
            </div>
        );
    };

    const pctColor = (pct: number) =>
        Math.abs(pct) < 0.0005 ? 'text-gray-400' : pct > 0 ? 'text-emerald-600' : 'text-rose-500';

    // How the pair's exchanges compare with the market rate of their day: the weighted
    // percentage plus the total kept by (or won from) the exchanger, in the source currency.
    const renderVsMarket = (pair: PairStat, align: 'start' | 'end' = 'end') => {
        if (isPrivacyMode) return <span className="text-gray-300 text-xs">•••</span>;

        const b = benchmarks.byPair.get(pair.key);
        if (!b) {
            return historyLoading
                ? <span className="text-gray-300 text-xs">…</span>
                : <span className="text-gray-300 text-xs" title={`No reference rate for these dates (available from ${formatDate(FIRST_SNAPSHOT_DATE)})`}>—</span>;
        }

        const negligible = Math.abs(b.vsMarketPct) < 0.0005;
        const items = align === 'end' ? 'items-end' : 'items-start';
        const title = negligible
            ? 'You exchanged at about the market rate'
            : b.vsMarketPct < 0
                ? `The exchanger kept ${Math.abs(b.vsMarketPct * 100).toFixed(1)}% versus the market rate of the day — ${formatAmount(b.lossRub, 'RUB')} in total`
                : `You got ${(b.vsMarketPct * 100).toFixed(1)}% more than the market rate of the day — ${formatAmount(-b.lossRub, 'RUB')} in total`;

        return (
            <div className={`flex flex-col ${items}`} title={title}>
                <div className={`font-semibold ${pctColor(b.vsMarketPct)}`}>
                    {negligible ? '≈ market' : formatSignedPct(b.vsMarketPct)}
                </div>
                <div className="text-[11px] text-gray-400 whitespace-nowrap">
                    {formatLoss(b.lossFrom, pair.from)}
                    {b.covered < pair.count && <span title={`${b.covered} of ${pair.count} exchanges have a reference rate`}> · {b.covered}/{pair.count}</span>}
                </div>
            </div>
        );
    };

    // Headline for the whole history: the total kept by exchangers (in RUB, so pairs in
    // different currencies add up), and the pairs where most of it went.
    const renderCutSummary = () => {
        const { total } = benchmarks;
        const ready = !isPrivacyMode && total.covered > 0;
        const gained = ready && total.lossRub < 0;
        const negligible = ready && Math.abs(total.vsMarketPct) < 0.0005;

        const topPairs = ready
            ? pairs
                .map(p => ({ pair: p, bench: benchmarks.byPair.get(p.key) }))
                .filter((x): x is { pair: PairStat; bench: PairBenchmark } => !!x.bench && Math.abs(x.bench.lossRub) >= 1)
                .sort((a, b) => Math.abs(b.bench.lossRub) - Math.abs(a.bench.lossRub))
                .slice(0, 4)
            : [];

        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6 flex flex-col md:flex-row md:items-center gap-4 md:gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-75">
                <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${gained ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                        <HandCoins className={`w-6 h-6 ${gained ? 'text-emerald-500' : 'text-rose-400'}`} strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs md:text-sm font-medium text-gray-500">
                            {gained ? 'Won from exchangers vs market rate' : "Exchangers' cut vs market rate"}
                        </p>
                        <h3 className={`text-2xl font-bold ${!ready ? 'text-gray-400' : negligible ? 'text-gray-700' : gained ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {isPrivacyMode ? '••••' : total.covered === 0 ? (historyLoading ? '…' : '—') : formatLoss(total.lossRub, 'RUB')}
                        </h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {total.covered === 0
                                ? (historyLoading
                                    ? 'Loading reference rates for your exchange dates…'
                                    : `No reference rates for these dates (available from ${formatDate(FIRST_SNAPSHOT_DATE)})`)
                                : <>
                                    {isPrivacyMode ? '•••' : formatSignedPct(total.vsMarketPct)} on average
                                    {' · '}{total.covered} of {totals.crossCount} exchanges
                                    {historyLoading && ' · still loading'}
                                </>}
                        </p>
                    </div>
                </div>
                {topPairs.length > 0 && (
                    <div className="md:ml-auto flex flex-wrap gap-2 text-xs">
                        {topPairs.map(({ pair, bench }) => (
                            <button
                                key={pair.key}
                                type="button"
                                onClick={() => toggleExpand(pair.key)}
                                className="px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/40 transition-colors flex items-center gap-1.5"
                                title={`${formatSignedPct(bench.vsMarketPct)} vs market · ${formatLoss(bench.lossFrom, pair.from)} — click to open`}
                            >
                                <span className="text-gray-600 font-medium">{pair.from}</span>
                                <ArrowRight className="w-3 h-3 text-gray-300" />
                                <span className="text-gray-600 font-medium">{pair.to}</span>
                                <span className={`font-semibold ${bench.lossRub > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                                    {formatLoss(bench.lossRub, 'RUB')}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const SortIcon = ({ field }: { field: SortField }) =>
        sortField === field ? <ArrowUpDown className="w-3 h-3" /> : null;

    // Detail block shared between desktop rows and mobile cards.
    const renderDetail = (pair: PairStat) => {
        const chronological = [...pair.observations].reverse(); // oldest -> newest for sparkline
        // "Best" = the most favourable deal for the user. When the rate is quoted as
        // spent-per-received (base is the currency you receive), a lower rate is cheaper = better.
        // When it's received-per-spent (base is what you spend), a higher rate gets you more = better.
        const lowerIsBetter = pair.base === pair.to;
        const bestRate = lowerIsBetter ? pair.minRate : pair.maxRate;
        const worstRate = lowerIsBetter ? pair.maxRate : pair.minRate;
        const bench = benchmarks.byPair.get(pair.key);
        return (
            <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                    <div>
                        <span className="text-gray-400 block">Weighted rate</span>
                        <span className="font-semibold text-gray-800">
                            1 {pair.base} = {formatRate(pair.weightedRate)} {pair.quote}
                        </span>
                    </div>
                    <div>
                        <span className="text-gray-400 block">Best / Worst</span>
                        <span className="font-medium">
                            <span className="text-emerald-600">{formatRate(bestRate)}</span>
                            <span className="text-gray-400"> / </span>
                            <span className="text-gray-500">{formatRate(worstRate)}</span>
                        </span>
                    </div>
                    <div>
                        <span className="text-gray-400 block">Volume moved</span>
                        <span className="font-medium text-gray-700">
                            {maskVol(pair.fromVolume, pair.from)} → {maskVol(pair.toVolume, pair.to)}
                        </span>
                    </div>
                    <div>
                        <span className="text-gray-400 block">Exchanger's cut</span>
                        {isPrivacyMode || !bench ? (
                            <span className="font-medium text-gray-400">{isPrivacyMode ? '•••' : historyLoading ? '…' : '—'}</span>
                        ) : (
                            <span className="font-medium">
                                <span className={pctColor(bench.vsMarketPct)}>{formatSignedPct(bench.vsMarketPct)}</span>
                                <span className="text-gray-400"> · </span>
                                <span className="text-gray-700">{formatLoss(bench.lossFrom, pair.from)}</span>
                                {pair.from !== 'RUB' && <span className="text-gray-400"> (≈ {formatLoss(bench.lossRub, 'RUB')})</span>}
                            </span>
                        )}
                    </div>
                    {bench && !isPrivacyMode && bench.covered > 1 && (
                        <div>
                            <span className="text-gray-400 block">Best / Worst deal vs market</span>
                            <span className="font-medium">
                                <span className={pctColor(bench.bestPct)}>{formatSignedPct(bench.bestPct)}</span>
                                <span className="text-gray-400"> / </span>
                                <span className={pctColor(bench.worstPct)}>{formatSignedPct(bench.worstPct)}</span>
                            </span>
                        </div>
                    )}
                    {chronological.length > 1 && (
                        <div className="ml-auto">
                            <span className="text-gray-400 block mb-0.5">Trend</span>
                            <Sparkline values={chronological.map(o => o.rate)} />
                        </div>
                    )}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-gray-400 text-xs uppercase tracking-wider border-b border-gray-100">
                                <th className="text-left py-2 font-medium">Date</th>
                                <th className="text-left py-2 font-medium">Route</th>
                                <th className="text-right py-2 font-medium">Sent</th>
                                <th className="text-right py-2 font-medium">Received</th>
                                <th className="text-right py-2 font-medium">Rate</th>
                                <th className="text-right py-2 font-medium" title="Reference rate on the day of the exchange">Market</th>
                                <th className="text-right py-2 font-medium" title="How much more (+) or less (−) you got than the market rate would have given">vs market</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {pair.observations.map((o, i) => {
                                const ob = bench?.perObs[i] ?? null;
                                return (
                                    <tr key={`${o.date}-${o.index}-${i}`} className="hover:bg-gray-100/40 transition-colors">
                                        <td className="py-2.5 text-gray-500 whitespace-nowrap">{formatDate(o.date)}</td>
                                        <td className="py-2.5 text-gray-600">
                                            <span className="inline-flex items-center gap-1.5">
                                                <span className="font-medium text-gray-700">{o.fromAccount}</span>
                                                <ArrowRight className="w-3 h-3 text-gray-300" />
                                                <span className="font-medium text-gray-700">{o.toAccount}</span>
                                            </span>
                                        </td>
                                        <td className="py-2.5 text-right text-gray-600 whitespace-nowrap">{maskVol(o.fromAmount, o.fromCurrency)}</td>
                                        <td className="py-2.5 text-right text-gray-600 whitespace-nowrap">{maskVol(o.toAmount, o.toCurrency)}</td>
                                        <td className="py-2.5 text-right font-semibold text-emerald-700 whitespace-nowrap">
                                            {formatRate(o.rate)}
                                        </td>
                                        <td className="py-2.5 text-right text-gray-500 whitespace-nowrap">
                                            {isPrivacyMode ? '•••' : ob ? formatRate(ob.marketRate) : historyLoading ? '…' : '—'}
                                        </td>
                                        <td className="py-2.5 text-right whitespace-nowrap">
                                            {isPrivacyMode || !ob ? (
                                                <span className="text-gray-300">{isPrivacyMode ? '•••' : historyLoading ? '…' : '—'}</span>
                                            ) : (
                                                <>
                                                    <span className={`font-semibold ${pctColor(ob.vsMarketPct)}`}>
                                                        {isImplausibleCut(ob.vsMarketPct) && (
                                                            <span
                                                                className="text-amber-500 mr-1 cursor-help"
                                                                title={`More than ${IMPLAUSIBLE_CUT_PCT}% off the market rate — a real exchange almost never is. Check the amounts of this transfer (missing thousands? wrong currency?).`}
                                                            >⚠</span>
                                                        )}
                                                        {formatSignedPct(ob.vsMarketPct)}
                                                    </span>
                                                    <span className="block text-[11px] text-gray-400">{formatLoss(ob.lossSent, o.fromCurrency)}</span>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // --- Empty states -------------------------------------------------------
    if (needsReimport) {
        return (
            <div className="space-y-6">
                <PageHeader transactions={[]} />
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-start gap-4">
                    <Info className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-semibold text-amber-900">Re-upload your file to see rates</h3>
                        <p className="text-sm text-amber-800/80 mt-1 max-w-2xl">
                            Currency rates are derived from both legs of each transfer (outgoing and incoming
                            amount + currency). Your currently loaded data was imported before this was captured,
                            so please re-upload your spreadsheet — use <span className="font-medium">Clear Data</span> in
                            the menu, then upload the file again. Your existing transfers will be re-read with the
                            currency information intact.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (pairs.length === 0) {
        return (
            <div className="space-y-6">
                <PageHeader transactions={[]} />
                <div className="bg-white border border-gray-100 rounded-xl p-12 text-center shadow-sm">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                        <ArrowRightLeft className="w-7 h-7 text-emerald-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-800">No cross-currency transfers yet</h3>
                    <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                        {totals.totalTransfers > 0
                            ? `Found ${totals.totalTransfers} transfer(s), but they are all within a single currency, so there is no exchange rate to average.`
                            : 'Once you record transfers between accounts in different currencies, their average exchange rates will show up here.'}
                    </p>
                </div>
            </div>
        );
    }

    // --- Main view ----------------------------------------------------------
    return (
        <div className="space-y-6">
            <PageHeader transactions={transactions.filter(t => t.type === 'transfer')} />

            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <StatCard icon={<Layers className="w-8 h-8 text-emerald-500" strokeWidth={1.5} />} label="Currency pairs" value={String(totals.pairCount)} />
                <StatCard icon={<Repeat className="w-8 h-8 text-blue-500" strokeWidth={1.5} />} label="Exchanges analysed" value={String(totals.crossCount)} />
                <StatCard icon={<Coins className="w-8 h-8 text-violet-500" strokeWidth={1.5} />} label="Currencies" value={String(totals.currencyCount)} />
                <StatCard icon={<ArrowRightLeft className="w-8 h-8 text-gray-400" strokeWidth={1.5} />} label="Same-currency moves" value={String(totals.internalCount)} description="excluded from rates" />
            </div>

            {/* Exchanger's cut: what all exchanges cost versus the market rate of their day */}
            {renderCutSummary()}

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-800">Average exchange rates</h3>
                        <p className="text-sm text-gray-500">Derived from your account-to-account transfers</p>
                    </div>
                    <div className="relative flex-1 sm:max-w-xs">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search currency (USD, THB...)"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 pr-8 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent w-full transition-all"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden p-4 bg-gray-50/50 space-y-3">
                    {filteredSorted.map(pair => {
                        const isOpen = expanded.has(pair.key);
                        return (
                            <div key={pair.key} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                <div className="flex justify-between items-start cursor-pointer" onClick={() => toggleExpand(pair.key)}>
                                    <div>
                                        <div className="flex items-center gap-2 font-semibold text-gray-900">
                                            <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-xs">{pair.from}</span>
                                            <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs">{pair.to}</span>
                                        </div>
                                        <div className="text-xs text-gray-400 mt-1">{pair.count} exchange{pair.count === 1 ? '' : 's'} · last {formatDate(pair.lastDate)}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-gray-900">{formatRate(pair.avgRate)}</div>
                                        <div className="text-[11px] text-gray-400">avg {pair.quote}/{pair.base}</div>
                                    </div>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                        <span className="text-gray-400 block">Range</span>
                                        <span className="font-medium text-gray-700">{formatRate(pair.minRate)} – {formatRate(pair.maxRate)}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400 block">Latest</span>
                                        <span className="font-medium text-gray-700">{formatRate(pair.lastRate)}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400 block">Now vs your avg</span>
                                        {renderMarketInfo(pair, 'start')}
                                    </div>
                                    <div>
                                        <span className="text-gray-400 block">Exchanger's cut</span>
                                        {renderVsMarket(pair, 'start')}
                                    </div>
                                </div>
                                {isOpen && (
                                    <div className="mt-4 pt-4 border-t border-gray-50 animate-in fade-in slide-in-from-top-1">
                                        {renderDetail(pair)}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {filteredSorted.length === 0 && (
                        <div className="text-center py-12 text-gray-400 text-sm">No pairs match your search</div>
                    )}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                                <TableHead className="w-[200px] cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('pair')}>
                                    <div className="flex items-center gap-1">Pair <SortIcon field="pair" /></div>
                                </TableHead>
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors bg-emerald-50/30" onClick={() => handleSort('avgRate')}>
                                    <div className="flex items-center justify-end gap-1 font-semibold text-emerald-900">Avg. rate <SortIcon field="avgRate" /></div>
                                </TableHead>
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('spread')} title="Lowest – highest rate you got, and how wide that range is relative to the average">
                                    <div className="flex items-center justify-end gap-1">Range <SortIcon field="spread" /></div>
                                </TableHead>
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('lastDate')}>
                                    <div className="flex items-center justify-end gap-1">Latest <SortIcon field="lastDate" /></div>
                                </TableHead>
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('nowVsAvg')}>
                                    <div className="flex items-center justify-end gap-1">Now vs your avg <SortIcon field="nowVsAvg" /></div>
                                </TableHead>
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('vsMarket')} title="Your rate versus the market rate on the day of each exchange — the spread or commission the exchanger kept">
                                    <div className="flex items-center justify-end gap-1">Exchanger's cut <SortIcon field="vsMarket" /></div>
                                </TableHead>
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('count')}>
                                    <div className="flex items-center justify-end gap-1">Exchanges <SortIcon field="count" /></div>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredSorted.map(pair => {
                                const isOpen = expanded.has(pair.key);
                                const spread = pair.avgRate > 0 ? (pair.maxRate - pair.minRate) / pair.avgRate : 0;
                                return (
                                    <React.Fragment key={pair.key}>
                                        <TableRow className="hover:bg-gray-50/50 cursor-pointer" onClick={() => toggleExpand(pair.key)}>
                                            <TableCell className="font-medium text-gray-900">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-gray-400 w-4">{isOpen ? '▼' : '▶'}</span>
                                                    <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-xs font-semibold">{pair.from}</span>
                                                    <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                                                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-semibold">{pair.to}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right bg-emerald-50/10">
                                                <div className="font-bold text-gray-900">{formatRate(pair.avgRate)}</div>
                                                <div className="text-[11px] text-gray-400">{pair.quote} per {pair.base}</div>
                                            </TableCell>
                                            <TableCell className="text-right whitespace-nowrap">
                                                <div className="text-gray-500 text-xs">{formatRate(pair.minRate)} – {formatRate(pair.maxRate)}</div>
                                                <div className="text-[11px] text-gray-400">{isPrivacyMode ? '•••' : `${(spread * 100).toFixed(1)}% spread`}</div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="font-medium text-gray-700">{formatRate(pair.lastRate)}</div>
                                                <div className="text-[11px] text-gray-400">{formatDate(pair.lastDate)}</div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {renderMarketInfo(pair, 'end')}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {renderVsMarket(pair, 'end')}
                                            </TableCell>
                                            <TableCell className="text-right text-gray-500 font-medium">{pair.count}</TableCell>
                                        </TableRow>
                                        {isOpen && (
                                            <TableRow className="bg-gray-50/40 hover:bg-gray-50/40">
                                                <TableCell colSpan={7} className="p-0">
                                                    <div className="px-6 py-4 border-l-4 border-emerald-100 ml-4 my-2 bg-white/60 rounded-r-lg">
                                                        {renderDetail(pair)}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </TableBody>
                    </Table>
                    {filteredSorted.length === 0 && (
                        <div className="text-center py-12 text-gray-400 text-sm">No pairs match your search</div>
                    )}
                </div>
            </div>

            <p className="text-xs text-gray-400 flex items-start gap-1.5 px-1">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>
                    Rates are the simple average of each transfer's realised rate; same-currency transfers are excluded.
                    “Now vs your avg” shows how much more or less favourable today's rate is than your historical average
                    {ratesDate ? ` (reference rate from currency-api, as of ${ratesDate})` : ' (reference rate from currency-api)'}; pairs marked
                    <span className="text-gray-300"> *</span> fall back to your last transfer.
                    “Exchanger's cut” values what you sent and what you received at currency-api's reference rate for the day of
                    each exchange: a negative figure is the spread or commission the exchanger kept, a positive one means you beat
                    the market. Reference rates exist from {formatDate(FIRST_SNAPSHOT_DATE)}
                    {missingDates.length > 0
                        ? `; ${missingDates.length} exchange date${missingDates.length === 1 ? '' : 's'} without one ${missingDates.length === 1 ? 'is' : 'are'} shown as —`
                        : ''}.
                    This is a personal benchmark, not a market forecast.
                </span>
            </p>
        </div>
    );
};

// --- Small presentational helpers ------------------------------------------

const PageHeader: React.FC<{ transactions: { date: string }[] }> = ({ transactions }) => (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-gray-900">Currency Rates</h2>
            <p className="text-gray-500">Average exchange rates from your transfers</p>
        </div>
        {transactions.length > 0 && (
            <div className="px-3 py-1 bg-gray-100 rounded-lg text-xs md:text-sm font-medium text-gray-600 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                {getFormattedDateRange(transactions)}
            </div>
        )}
    </div>
);

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; description?: string }> = ({ icon, label, value, description }) => (
    <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100 flex items-start justify-between transition-all hover:shadow-md">
        <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-gray-500 mb-1 truncate">{label}</p>
            <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
            {description && <p className="text-[11px] text-gray-400 mt-1">{description}</p>}
        </div>
        <div className="flex-shrink-0 ml-3 hidden sm:block">{icon}</div>
    </div>
);
