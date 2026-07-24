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
} from 'lucide-react';
import { formatDate, getFormattedDateRange } from '../lib/utils';
import { usePrivacy } from '../contexts/PrivacyContext';

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
    key: string;           // "USDT/RUB"
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

type SortField = 'pair' | 'avgRate' | 'count' | 'lastDate' | 'spread';
type SortOrder = 'asc' | 'desc';

const mean = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / (arr.length || 1);

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

    const { pairs, totals, needsReimport } = useMemo(() => {
        const allTransfers = transactions.filter(t => t.type === 'transfer');

        // Old data imported before the transfer-leg fields existed won't carry currencies.
        const hasLegData = allTransfers.some(t => t.fromCurrency || t.toCurrency);

        const cross = allTransfers.filter(t =>
            t.fromCurrency && t.toCurrency &&
            t.fromCurrency !== t.toCurrency &&
            (t.fromAmount ?? 0) > 0 && (t.toAmount ?? 0) > 0
        );

        // Group by unordered currency pair.
        const groups = new Map<string, Transaction[]>();
        for (const t of cross) {
            const [a, b] = [t.fromCurrency!, t.toCurrency!].sort();
            const key = `${a}|${b}`;
            const list = groups.get(key) || [];
            list.push(t);
            groups.set(key, list);
        }

        const pairs: PairStat[] = [];
        const currencySet = new Set<string>();

        for (const [key, list] of groups) {
            const [a, b] = key.split('|');
            currencySet.add(a);
            currencySet.add(b);

            // "b per a" for each transfer, regardless of which way it flowed.
            const bPerA = list.map(t =>
                t.fromCurrency === a ? t.toAmount! / t.fromAmount! : t.fromAmount! / t.toAmount!
            );
            // Pick a display direction so the headline rate reads >= 1 (e.g. "1 USD = 1487 KRW").
            const [base, quote] = mean(bPerA) >= 1 ? [a, b] : [b, a];

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

            // Orient the pair by the *actual* money flow (source -> destination), so it reflects
            // "I spend RUB to buy USDT", not the reverse. The rate number stays quoted the readable
            // way (strong currency as base). Ties fall back to spending the weaker (quote) currency.
            let forward = 0; // transfers flowing a -> b
            for (const t of list) if (t.fromCurrency === a) forward++;
            const backward = list.length - forward;
            const [from, to] = forward > backward ? [a, b]
                : backward > forward ? [b, a]
                : [quote, base];

            pairs.push({
                key: `${base}/${quote}`,
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
        };
    }, [transactions]);

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
                case 'count':
                default:
                    return (a.count - b.count) * dir;
            }
        });
        return data;
    }, [pairs, searchQuery, sortField, sortOrder]);

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
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {pair.observations.map((o, i) => (
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
                                </tr>
                            ))}
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
                                        <div className="text-xs text-gray-400 mt-1">{pair.count} exchanges · last {formatDate(pair.lastDate)}</div>
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
                                <TableHead className="text-right">Range</TableHead>
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('spread')}>
                                    <div className="flex items-center justify-end gap-1">Spread <SortIcon field="spread" /></div>
                                </TableHead>
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('lastDate')}>
                                    <div className="flex items-center justify-end gap-1">Latest <SortIcon field="lastDate" /></div>
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
                                            <TableCell className="text-right text-gray-500 text-xs whitespace-nowrap">
                                                {formatRate(pair.minRate)} – {formatRate(pair.maxRate)}
                                            </TableCell>
                                            <TableCell className="text-right text-gray-500">
                                                {isPrivacyMode ? '•••' : `${(spread * 100).toFixed(1)}%`}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="font-medium text-gray-700">{formatRate(pair.lastRate)}</div>
                                                <div className="text-[11px] text-gray-400">{formatDate(pair.lastDate)}</div>
                                            </TableCell>
                                            <TableCell className="text-right text-gray-500 font-medium">{pair.count}</TableCell>
                                        </TableRow>
                                        {isOpen && (
                                            <TableRow className="bg-gray-50/40 hover:bg-gray-50/40">
                                                <TableCell colSpan={6} className="p-0">
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

            <p className="text-xs text-gray-400 flex items-center gap-1.5 px-1">
                <Info className="w-3.5 h-3.5" />
                Rates are the simple average of each transfer's realised rate. Same-currency transfers are excluded.
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
