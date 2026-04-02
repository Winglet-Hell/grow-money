import { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { resolveTripActiveTransactions } from '../lib/tripUtils';
import { cn, stringToColor } from '../lib/utils';
import { getCategoryIcon } from '../lib/categoryIcons';
import type { Transaction, Trip } from '../types';
import { Search, Globe, X, Tag as TagIcon, LayoutGrid } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList, CartesianGrid } from 'recharts';
import { TransactionListModal } from '../components/TransactionListModal';

interface TravelIndexPageProps {
    transactions: Transaction[];
}

const formatMoney = (amount: number, currency = 'RUB') => {
    const isRUB = currency === 'RUB';
    try {
        const value = new Intl.NumberFormat('en-US', {
            style: 'decimal',
            maximumFractionDigits: 0,
        }).format(amount);
        return isRUB ? `${value} ₽` : `${value} ${currency}`;
    } catch (e) {
        return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount)} ${currency}`;
    }
};

export function TravelIndexPage({ transactions }: TravelIndexPageProps) {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [selectedItem, setSelectedItem] = useState<{ type: 'tag' | 'category', value: string } | null>(null);
    const [calcMethod, setCalcMethod] = useState<'avg' | 'median'>('avg');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalData, setModalData] = useState<{ transactions: Transaction[], title: string, subtitle: string }>({
        transactions: [],
        title: '',
        subtitle: ''
    });

    useEffect(() => {
        const loadLocalTrips = async () => {
            const loadedTrips = await db.trips.toArray();
            setTrips(loadedTrips);
        };

        const loadCloudTrips = async (userId: string) => {
            const { data } = await supabase.from('trips').select('*').eq('user_id', userId);
            if (data) {
                const mappedTrips: Trip[] = data.map(t => ({
                    id: t.id,
                    name: t.name,
                    startDate: t.start_date,
                    endDate: t.end_date,
                    excludedTransactionIds: t.excluded_transaction_ids || [],
                    additionalTransactionIds: t.additional_transaction_ids || [],
                    transactionSnapshots: t.transaction_snapshots || {}
                }));
                // Sort by start date DESC
                mappedTrips.sort((a, b) => b.startDate.localeCompare(a.startDate));
                setTrips(mappedTrips);
            }
        };

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) loadCloudTrips(session.user.id);
            else loadLocalTrips();
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) loadCloudTrips(session.user.id);
            else {
                setTrips([]);
                loadLocalTrips();
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const aggregatedData = useMemo(() => {
        const tagsMap: Record<string, { count: number, total: number, catCounts: Record<string, number> }> = {};
        const catsMap: Record<string, { count: number, total: number }> = {};

        trips.forEach(trip => {
            const activeTxs = resolveTripActiveTransactions(trip, transactions);
            activeTxs.forEach(tx => {
                const amount = Math.abs(tx.amount);
                const cat = tx.category;

                // Category
                if (!catsMap[cat]) catsMap[cat] = { count: 0, total: 0 };
                catsMap[cat].count++;
                catsMap[cat].total += amount;

                // Tags
                if (tx.tags) {
                    const txTags = Array.isArray(tx.tags) ? tx.tags : [tx.tags];
                    txTags.forEach(tag => {
                        if (!tag) return;
                        const lowerTag = tag.trim().toLowerCase();
                        if (!tagsMap[lowerTag]) tagsMap[lowerTag] = { count: 0, total: 0, catCounts: {} };
                        tagsMap[lowerTag].count++;
                        tagsMap[lowerTag].total += amount;
                        
                        // Track category frequency for this tag
                        if (!tagsMap[lowerTag].catCounts[cat]) tagsMap[lowerTag].catCounts[cat] = 0;
                        tagsMap[lowerTag].catCounts[cat]++;
                    });
                }
            });
        });

        return { tagsMap, catsMap };
    }, [trips, transactions]);

    const topTags = useMemo(() => {
        return Object.entries(aggregatedData.tagsMap)
            .filter(([tag, stats]) => stats.count > 1 && tag.includes(searchQuery.toLowerCase().trim())) 
            .sort((a, b) => b[1].count - a[1].count)
            .map(([tag, stats]) => {
                // Find primary category for this tag
                const mainCategory = Object.entries(stats.catCounts)
                    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Uncategorized';
                return { name: tag, mainCategory };
            });
    }, [aggregatedData, searchQuery]);

    const topCats = useMemo(() => {
        return Object.entries(aggregatedData.catsMap)
            .filter(([cat]) => cat.toLowerCase().includes(searchQuery.toLowerCase().trim()))
            .sort((a, b) => b[1].count - a[1].count)
            .map(([cat]) => cat);
    }, [aggregatedData, searchQuery]);


    const getMedian = (arr: number[]) => {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    const indexResults = useMemo(() => {
        if (!selectedItem) return [];

        const isTag = selectedItem.type === 'tag';
        const targetValue = selectedItem.value.toLowerCase();

        return trips.map(trip => {
            const activeTxs = resolveTripActiveTransactions(trip, transactions);

            const matchedTxs = activeTxs.filter(tx => {
                if (isTag) {
                    if (!tx.tags) return false;
                    const txTags = Array.isArray(tx.tags) ? tx.tags : [tx.tags];
                    return txTags.some(tag => tag && tag.trim().toLowerCase() === targetValue);
                } else {
                    return tx.category.toLowerCase() === targetValue;
                }
            });

            if (matchedTxs.length === 0) return null;

            const total = matchedTxs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
            const count = matchedTxs.length;
            const amounts = matchedTxs.map(tx => Math.abs(tx.amount));
            const avg = total / count;
            const median = getMedian(amounts);

            return {
                tripId: trip.id,
                tripName: trip.name,
                startDate: trip.startDate,
                avgCheck: avg,
                medianCheck: median,
                displayValue: calcMethod === 'avg' ? avg : median,
                totalAmount: total,
                txCount: count,
                minCheck: Math.min(...amounts),
                maxCheck: Math.max(...amounts),
                transactions: matchedTxs
            };
        })
            .filter(Boolean)
            .sort((a, b) => (b?.displayValue || 0) - (a?.displayValue || 0)) as any[];
    }, [selectedItem, trips, transactions, calcMethod]);


    const showTransactions = (data: any) => {
        if (!data) return;
        // In Recharts Bar onClick, data is the data point. 
        // In BarChart onClick, payload is usually in activePayload[0].payload.
        const payload = data.payload || data; 
        
        if (!payload.transactions) return;

        setModalData({
            transactions: payload.transactions,
            title: `${selectedItem?.value.toUpperCase()} in ${payload.tripName}`,
            subtitle: `${payload.txCount} transactions • ${calcMethod === 'avg' ? 'Average' : 'Median'} ${formatMoney(payload.displayValue)}`
        });
        setIsModalOpen(true);
    };

    const handleChartClick = (state: any) => {
        if (state && state.activePayload && state.activePayload.length) {
            showTransactions(state.activePayload[0].payload);
        } else if (state && state.payload) {
            // Some recharts versions/event types provide it here
            showTransactions(state.payload);
        }
    };

    const CustomYAxisTick = (props: any) => {
        const { x, y, payload } = props;
        const result = indexResults.find(r => r.tripName === payload.value);
        const dateStr = result ? new Date(result.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '';

        return (
            <g transform={`translate(${x},${y})`}>
                <text 
                    x={-12} 
                    y={-4} 
                    textAnchor="end" 
                    fill="#374151" 
                    fontSize={12} 
                    fontWeight="600"
                    className="truncate"
                >
                    {payload.value.length > 18 ? `${payload.value.substring(0, 18)}...` : payload.value}
                </text>
                <text 
                    x={-12} 
                    y={10} 
                    textAnchor="end" 
                    fill="#9ca3af" 
                    fontSize={10} 
                    fontWeight="500"
                    className="uppercase tracking-wider"
                >
                    {dateStr}
                </text>
            </g>
        );
    };

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="bg-white p-4 rounded-xl shadow-lg border border-gray-100 min-w-[200px]">
                    <p className="font-bold text-gray-900 mb-2 truncate">{data.tripName}</p>
                    <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">{calcMethod === 'avg' ? 'Average' : 'Median'} Check:</span>
                            <span className="font-semibold text-emerald-600">{formatMoney(data.displayValue)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Transactions:</span>
                            <span className="font-medium text-gray-900">{data.txCount}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Total Spent:</span>
                            <span className="font-medium text-gray-900">{formatMoney(data.totalAmount)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-gray-400 mt-2 border-t pt-1">
                            <span>Min: {formatMoney(data.minCheck)}</span>
                            <span>Max: {formatMoney(data.maxCheck)}</span>
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    const dynamicHeight = useMemo(() => {
        if (indexResults.length === 0) return 400;
        // Base (header + margins) + (number of rows * ideal row space)
        return Math.max(500, (indexResults.length * 64) + 120);
    }, [indexResults.length]);

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Globe className="w-6 h-6 text-emerald-500" />
                        Travel Index
                    </h2>
                    <p className="text-gray-500">Compare average check for categories and tags across all your trips.</p>
                </div>
            </div>

            {!selectedItem ? (
                // --- DISCOVER VIEW ---
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 min-h-[50vh]">
                    <div className="relative h-12 flex items-center mb-10">
                        <h3 className="text-xl font-bold text-gray-900">
                            Browse & Compare
                        </h3>
                        
                        <div className={cn(
                            "absolute right-0 top-0 transition-all duration-300 ease-in-out",
                            isSearchExpanded ? "w-full max-w-md" : "w-12"
                        )}>
                            {!isSearchExpanded ? (
                                <button 
                                    onClick={() => setIsSearchExpanded(true)}
                                    className="w-12 h-12 flex items-center justify-center hover:bg-gray-50 rounded-xl border border-gray-100 text-gray-400 hover:text-emerald-500 transition-all shadow-sm group"
                                    title="Quick search"
                                >
                                    <Search className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                </button>
                            ) : (
                                <div className="relative w-full h-12 animate-in fade-in zoom-in-95 duration-200">
                                    <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500" />
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="Search tags or categories..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Escape' && setIsSearchExpanded(false)}
                                        className="w-full h-full pl-10 pr-10 rounded-xl border border-gray-100 bg-gray-50 focus:bg-white transition-all outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm text-gray-900 shadow-inner"
                                    />
                                    <button 
                                        onClick={() => {
                                            setSearchQuery('');
                                            setIsSearchExpanded(false);
                                        }}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        <X className="w-4 h-4 text-gray-400" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-10 max-w-5xl mx-auto">
                        {/* TAGS */}
                        {topTags.length > 0 && (
                            <div className="space-y-3">
                                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                    <TagIcon className="w-4 h-4" /> Discover Tags
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {topTags.map(tag => {
                                        return (
                                            <button
                                                key={tag.name}
                                                onClick={() => setSelectedItem({ type: 'tag', value: tag.name })}
                                                className={cn(
                                                    "px-4 py-2 rounded-lg transition-all text-sm font-bold border uppercase tracking-wide shadow-sm hover:scale-105 active:scale-95",
                                                    "text-slate-500 border-slate-200 bg-transparent"
                                                )}
                                            >
                                                {tag.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* CATEGORIES */}
                        {topCats.length > 0 && (
                            <div className="space-y-3 pt-4 border-t border-gray-100">
                                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                    <LayoutGrid className="w-4 h-4" /> Or Compare Categories
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {topCats.map(cat => {
                                        const Icon = getCategoryIcon(cat);
                                        const colors = stringToColor(cat);
                                        return (
                                            <button
                                                key={cat}
                                                onClick={() => setSelectedItem({ type: 'category', value: cat })}
                                                className={cn(
                                                    "px-4 py-2 rounded-lg transition-all text-sm font-bold flex items-center gap-2 border uppercase tracking-wide shadow-sm hover:scale-105 active:scale-95",
                                                    colors.bg,
                                                    colors.text,
                                                    "border-current border-opacity-20"
                                                )}
                                            >
                                                <Icon className="w-4 h-4" />
                                                {cat}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        
                        {topTags.length === 0 && topCats.length === 0 && (
                            <div className="text-center py-12 text-gray-500">
                                No tags or categories found matching "{searchQuery}" in your trips.
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                // --- DETAILED INDEX VIEW ---
                <div className="space-y-6">
                    {/* Header Controls */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setSelectedItem(null)}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                title="Back to discover"
                            >
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                            <div className={cn(
                                "px-3 py-1 rounded-md font-semibold text-lg uppercase tracking-wide border transition-all shadow-sm",
                                selectedItem.type === 'tag' 
                                    ? "bg-transparent border-slate-200 text-slate-600" 
                                    : "bg-emerald-100 border-emerald-200 text-emerald-800"
                            )}>
                                {selectedItem.value}
                            </div>
                            <span className="text-gray-400 text-sm">across {indexResults.length} trips</span>
                        </div>

                        <div className="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200">
                            <button
                                onClick={() => setCalcMethod('avg')}
                                className={cn(
                                    "px-4 py-1.5 rounded-lg text-sm font-bold transition-all",
                                    calcMethod === 'avg' 
                                        ? "bg-white text-emerald-600 shadow-sm" 
                                        : "text-gray-400 hover:text-gray-600"
                                )}
                            >
                                Average
                            </button>
                            <button
                                onClick={() => setCalcMethod('median')}
                                className={cn(
                                    "px-4 py-1.5 rounded-lg text-sm font-bold transition-all",
                                    calcMethod === 'median' 
                                        ? "bg-white text-emerald-600 shadow-sm" 
                                        : "text-gray-400 hover:text-gray-600"
                                )}
                            >
                                Median
                            </button>
                        </div>
                    </div>

                    {indexResults.length === 0 ? (
                        <div className="bg-white rounded-2xl p-12 text-center text-gray-500 border border-gray-100">
                            No data found for this {selectedItem.type} in any trips.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            
                            {/* CHART */}
                            <div 
                                className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col"
                                style={{ height: dynamicHeight }}
                            >
                                <h3 className="text-lg font-bold text-gray-900 mb-6 border-b pb-4 border-gray-50">{calcMethod === 'avg' ? 'Average' : 'Median'} Check Leaderboard</h3>
                                <div className="flex-1 min-h-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart 
                                            data={indexResults} 
                                            layout="vertical"
                                            margin={{ top: 20, right: 60, left: 20, bottom: 20 }}
                                            onClick={handleChartClick}
                                            barCategoryGap="30%"
                                        >
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                            <XAxis 
                                                type="number" 
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#94a3b8', fontSize: 10 }}
                                                tickFormatter={(val) => `${val} ₽`}
                                            />
                                            <YAxis 
                                                dataKey="tripName" 
                                                type="category" 
                                                axisLine={false}
                                                tickLine={false}
                                                width={140}
                                                tick={<CustomYAxisTick />}
                                            />
                                            <Tooltip cursor={{ fill: '#f3f4f6', radius: 4 }} content={<CustomTooltip />} />
                                            <Bar 
                                                name={calcMethod === 'avg' ? 'Average price' : 'Median price'}
                                                dataKey="displayValue" 
                                                radius={[0, 4, 4, 0]}
                                                barSize={32}
                                                onClick={(data) => showTransactions(data)}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <LabelList 
                                                    dataKey="displayValue" 
                                                    position="right" 
                                                    formatter={(val: any) => val ? formatMoney(Number(val)) : ''}  
                                                    fill="#475569" 
                                                    fontSize={11} 
                                                    fontWeight="700"
                                                    offset={10}
                                                />
                                                {indexResults.map((_, index) => {
                                                    const ratio = indexResults.length > 1 ? index / (indexResults.length - 1) : 0;
                                                    // Interpolate color from Red (0°) to Emerald/Green (140°)
                                                    // We use a slight curve or just direct HSL for a nice gradient
                                                    const hue = ratio * 140; 
                                                    return (
                                                        <Cell 
                                                            key={`cell-${index}`} 
                                                            fill={`hsl(${hue}, 45%, 85%)`} 
                                                            fillOpacity={1} 
                                                        />
                                                    );
                                                })}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* LIST */}
                            <div 
                                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 overflow-hidden flex flex-col"
                                style={{ height: dynamicHeight }}
                            >
                                <h3 className="text-lg font-bold text-gray-900 mb-6 sticky top-0 bg-white border-b pb-4 border-gray-50 z-10">Trip Breakdown</h3>
                                <div className="flex-1 overflow-y-auto space-y-4 scrollbar-hide">
                                    {indexResults.map((result, idx) => (
                                        <div 
                                            key={result.tripId} 
                                            className="p-4 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                                            onClick={() => {
                                                setModalData({
                                                    transactions: result.transactions,
                                                    title: `${selectedItem?.value.toUpperCase()} in ${result.tripName}`,
                                                    subtitle: `${result.txCount} transactions • ${calcMethod === 'avg' ? 'Average' : 'Median'} ${formatMoney(result.displayValue)}`
                                                });
                                                setIsModalOpen(true);
                                            }}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="font-semibold text-gray-900 line-clamp-1 mr-2 flex items-center gap-1.5">
                                                    <span className="text-xs font-bold text-gray-400 mb-px w-4">{idx + 1}.</span>
                                                    {result.tripName}
                                                </div>
                                                <div className={cn(
                                                    "font-bold shrink-0",
                                                    idx === 0 ? "text-red-600" : idx === indexResults.length - 1 ? "text-emerald-600" : "text-gray-900"
                                                )}>
                                                    {formatMoney(result.displayValue)}
                                                </div>
                                            </div>
                                            <div className="flex justify-between text-xs text-gray-500">
                                                <span>{result.txCount} txs • {formatMoney(result.totalAmount)} total</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <TransactionListModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                transactions={modalData.transactions}
                title={modalData.title}
                subtitle={modalData.subtitle}
            />
        </div>
    );
}
