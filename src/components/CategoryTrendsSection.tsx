import { useMemo, useState, useEffect } from 'react';
import { TrendingUp } from 'lucide-react';
import {
    ComposedChart,
    Line,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    LabelList
} from 'recharts';
import { getCategoryIcon } from '../lib/categoryIcons';
import { cn, stringToColor } from '../lib/utils';
import type { Transaction } from '../types';
import { usePrivacy } from '../contexts/PrivacyContext';
import { CustomTooltip } from './CustomTooltip';

interface CategoryTrendsSectionProps {
    transactions: Transaction[];
    period: '3M' | '6M' | '1Y' | 'ALL';
}

export function CategoryTrendsSection({ transactions, period }: CategoryTrendsSectionProps) {
    const { isPrivacyMode } = usePrivacy();
    const [type, setType] = useState<'expense' | 'income'>('expense');
    const [selectedCategory, setSelectedCategory] = useState<string>('');

    // 1. Get List of Categories for the selected Type - Sorted by Total Spend (Popularity)
    const categories = useMemo(() => {
        const categoryTotals: Record<string, number> = {};

        transactions.forEach(t => {
            if (t.type === type) {
                if (!categoryTotals[t.category]) categoryTotals[t.category] = 0;
                categoryTotals[t.category] += Math.abs(t.amount);
            }
        });

        // Sort by Total Amount (Desc)
        return Object.entries(categoryTotals)
            .sort((a, b) => b[1] - a[1]) // High to Low
            .map(([cat]) => cat);
    }, [transactions, type]);

    // 2. Smart Default: Select first category if current selection is invalid or empty
    useEffect(() => {
        if (!selectedCategory || !categories.includes(selectedCategory)) {
            if (categories.length > 0) {
                setSelectedCategory(categories[0]);
            } else {
                setSelectedCategory('');
            }
        }
    }, [categories, selectedCategory]);

    // 3. Prepare Chart Data and Metrics
    const { chartData, metrics } = useMemo(() => {
        if (!selectedCategory) return { chartData: [], metrics: null };

        const getMonthKey = (dateStr: string) => {
            const date = new Date(dateStr);
            return {
                key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
                label: new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date),
                timestamp: date.getTime()
            };
        };

        const monthlyData = new Map<string, { label: string; amount: number; timestamp: number }>();

        transactions.forEach(t => {
            if (t.type === type && t.category === selectedCategory) {
                const { key, label, timestamp } = getMonthKey(t.date);
                if (!monthlyData.has(key)) {
                    monthlyData.set(key, { label, amount: 0, timestamp });
                }
                monthlyData.get(key)!.amount += Math.abs(t.amount);
            }
        });

        let data = Array.from(monthlyData.values()).sort((a, b) => a.timestamp - b.timestamp);

        // Filter by Period
        if (period === '3M') data = data.slice(-3);
        else if (period === '6M') data = data.slice(-6);
        else if (period === '1Y') data = data.slice(-12);

        // --- Metrics Calculation ---
        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // Exclude current month to find "Closed Months"
        const closedMonthsData = data.filter(d => {
            const dDate = new Date(d.timestamp);
            const dKey = `${dDate.getFullYear()}-${String(dDate.getMonth() + 1).padStart(2, '0')}`;
            return dKey < currentMonthKey;
        });

        let avg = 0;
        let lastClosedAmount = 0;
        let prevClosedAmount = 0;
        let diffAbs = 0;
        let diffPercent = 0;
        let diffPrevAbs = 0;
        let diffPrevPercent = 0;

        if (closedMonthsData.length > 0) {
            // Last Closed is the last item
            const lastClosed = closedMonthsData[closedMonthsData.length - 1];
            lastClosedAmount = lastClosed.amount;

            // Average of previous months (Standard)
            const previousMonths = closedMonthsData.slice(0, -1);

            if (previousMonths.length > 0) {
                const totalPrevious = previousMonths.reduce((sum, item) => sum + item.amount, 0);
                avg = totalPrevious / previousMonths.length;
            } else {
                // Fallback if only 1 month of history
                avg = lastClosedAmount;
            }

            diffAbs = lastClosedAmount - avg;
            diffPercent = avg > 0 ? (diffAbs / avg) * 100 : 0;

            // Previous month calculation
            const prevClosed = previousMonths.length > 0 ? previousMonths[previousMonths.length - 1] : null;
            if (prevClosed) {
                prevClosedAmount = prevClosed.amount;
                diffPrevAbs = lastClosedAmount - prevClosedAmount;
                diffPrevPercent = prevClosedAmount > 0 ? (diffPrevAbs / prevClosedAmount) * 100 : (lastClosedAmount > 0 ? 100 : 0);
            }
        }

        // Calculate Linear Trend Line (Based on CLOSED months only)
        // x = index (0, 1, 2...), y = amount
        const nRel = closedMonthsData.length;
        let trendData = data;

        if (nRel >= 2) {
            let sumX = 0;
            let sumY = 0;
            let sumXY = 0;
            let sumXX = 0;

            closedMonthsData.forEach((d, i) => {
                sumX += i;
                sumY += d.amount;
                sumXY += i * d.amount;
                sumXX += i * i;
            });

            const slope = (nRel * sumXY - sumX * sumY) / (nRel * sumXX - sumX * sumX);
            const intercept = (sumY - slope * sumX) / nRel;

            // Apply trend to ALL data (projecting into current month)
            trendData = data.map((d, i) => ({
                ...d,
                trend: Math.max(0, slope * i + intercept) // Ensure trend doesn't go below 0 for visualization
            }));
        } else {
            // Not enough closed data for a trend, just follow amounts or flat line
            trendData = data.map(d => ({ ...d, trend: d.amount }));
        }

        return {
            chartData: trendData,
            metrics: { avg, lastClosedAmount, prevClosedAmount, diffAbs, diffPercent, diffPrevAbs, diffPrevPercent }
        };
    }, [transactions, type, selectedCategory, period]);



    const formatShortValue = (val: any) => {
        const num = Number(val);
        if (isNaN(num)) return '';
        if (Math.abs(num) >= 1000000) return (num / 1000000).toFixed(0) + 'M';
        if (Math.abs(num) >= 1000) return (num / 1000).toFixed(0) + 'k';
        return Math.round(num).toString();
    };

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm h-auto md:h-[400px] flex flex-col col-span-1 lg:col-span-2">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <h3 className="text-lg font-semibold text-gray-900">Category Trends</h3>

                    {/* Metrics Display */}
                    {metrics && metrics.lastClosedAmount > 0 && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-sm md:border-l md:pl-4 border-gray-200">

                            {/* Main Stat: Last Closed */}
                            <div>
                                <span className="text-gray-400 block text-[10px] uppercase tracking-wider font-medium">Last Closed</span>
                                <span className="font-semibold text-gray-900 text-lg">₽{formatShortValue(metrics.lastClosedAmount)}</span>
                            </div>

                            {/* Main Stat: Average */}
                            <div>
                                <span className="text-gray-400 block text-[10px] uppercase tracking-wider font-medium">Average</span>
                                <span className="font-semibold text-gray-900 text-lg">₽{formatShortValue(metrics.avg)}</span>
                            </div>

                            {/* Comparisons Group */}
                            <div className="flex flex-col gap-1">
                                {/* vs Average */}
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="text-gray-400 w-12 text-right">vs Avg:</span>
                                    <div className={`flex items-center gap-1 font-medium ${(type === 'expense' && metrics.diffAbs > 0) || (type === 'income' && metrics.diffAbs < 0)
                                        ? 'text-red-600'
                                        : 'text-emerald-600'
                                        }`}>
                                        <TrendingUp className={`w-3 h-3 ${metrics.diffAbs < 0 ? 'rotate-180' : ''}`} />
                                        <span>
                                            {metrics.diffAbs > 0 ? '+' : ''}{formatShortValue(metrics.diffAbs)} ({metrics.diffPercent.toFixed(1)}%)
                                        </span>
                                    </div>
                                </div>

                                {/* vs Previous Month */}
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="text-gray-400 w-12 text-right">vs Prev:</span>
                                    <div className={`flex items-center gap-1 font-medium ${(type === 'expense' && metrics.diffPrevAbs > 0) || (type === 'income' && metrics.diffPrevAbs < 0)
                                        ? 'text-red-600'
                                        : 'text-emerald-600'
                                        }`}>
                                        <TrendingUp className={`w-3 h-3 ${metrics.diffPrevAbs < 0 ? 'rotate-180' : ''}`} />
                                        <span>
                                            {metrics.diffPrevAbs > 0 ? '+' : ''}{formatShortValue(metrics.diffPrevAbs)} ({metrics.diffPrevPercent.toFixed(1)}%)
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Type Switcher */}
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button
                            onClick={() => setType('expense')}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${type === 'expense' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                            Expenses
                        </button>
                        <button
                            onClick={() => setType('income')}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${type === 'income' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                            Income
                        </button>
                    </div>

                    {/* Category Selector with Icon */}
                    <div className="flex items-center gap-2">
                        {selectedCategory && (
                            <div className={cn(
                                "p-1.5 rounded-md transition-colors",
                                stringToColor(selectedCategory).bg,
                                stringToColor(selectedCategory).text
                            )}>
                                {(() => {
                                    const Icon = getCategoryIcon(selectedCategory);
                                    return <Icon className="w-5 h-5" />;
                                })()}
                            </div>
                        )}
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="block w-48 px-3 py-1.5 text-base border-gray-300 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm rounded-md bg-gray-50 border transition-all hover:bg-white appearance-none"
                        >
                            {categories.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="h-[300px] md:h-auto md:flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis
                            dataKey="label"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 12, fill: '#6B7280', fontFamily: 'Inter, sans-serif' }}
                            dy={10}
                            height={60}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 12, fill: '#6B7280', fontFamily: 'Inter, sans-serif' }}
                            tickFormatter={formatShortValue}
                        />
                        <Tooltip
                            content={<CustomTooltip isPrivacy={isPrivacyMode} />}
                            cursor={{ fill: 'rgba(249, 250, 251, 0.5)' }}
                        />
                        <Bar
                            dataKey="amount"
                            name={selectedCategory}
                            fill={type === 'income' ? '#10b981' : '#f43f5e'}
                            radius={[4, 4, 0, 0]}
                            maxBarSize={50}
                        >
                            <LabelList dataKey="amount" position="top" formatter={formatShortValue} style={{ fontSize: '10px', fill: '#6B7280' }} />
                        </Bar>
                        <Line
                            type="monotone"
                            dataKey="trend"
                            stroke="#9CA3AF"
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={false}
                            activeDot={false}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
