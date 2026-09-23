import { useMemo, useState, useEffect } from 'react';
import { TrendingUp, ChevronDown } from 'lucide-react';
import {
    ComposedChart,
    Bar,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
    ResponsiveContainer,
    LabelList
} from 'recharts';
import { getCategoryIcon } from '../lib/categoryIcons';
import { cn, stringToColor } from '../lib/utils';
import type { Transaction } from '../types';
import { monthKeyOf, monthKeyFromDate, monthLabel, shiftMonthKey } from '../lib/periods';
import { niceScale, labelIndices } from '../lib/chartScale';
import { ScrollableChart, PickedBarLabel } from './ChartParts';
import { usePrivacy } from '../contexts/PrivacyContext';
import { CustomTooltip } from './CustomTooltip';

interface CategoryTrendsSectionProps {
    transactions: Transaction[];
    period: '3M' | '6M' | '1Y' | 'ALL';
}

// The average line's label, set just past the line's right end (in the chart's right margin)
// so it never lands on a bar or a bar's value.
function AverageLineLabel({ text, viewBox }: { text: string; viewBox?: { x: number; y: number; width: number } }) {
    if (!viewBox) return null;
    return (
        <text x={viewBox.x + viewBox.width + 6} y={viewBox.y} dy={3} textAnchor="start" fill="#6B7280" fontSize={10}>
            {text}
        </text>
    );
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

        // One point per calendar month across the whole history of this type, zeros included.
        // With only the months the category was used, a month without it vanished: "last
        // closed" became some earlier month, the average skipped the zeros (an occasional
        // purchase averaged as if it were monthly), and 3M meant the last three months *with*
        // spending rather than the last three months.
        const monthlyAmounts = new Map<string, number>();
        let firstKey: string | null = null;
        let lastKey: string | null = null;

        for (const t of transactions) {
            if (t.type !== type) continue;
            const key = monthKeyOf(t.date);
            if (!key) continue;
            if (!firstKey || key < firstKey) firstKey = key;
            if (!lastKey || key > lastKey) lastKey = key;
            if (t.category === selectedCategory) {
                monthlyAmounts.set(key, (monthlyAmounts.get(key) ?? 0) + Math.abs(t.amount));
            }
        }

        let data: { key: string; label: string; amount: number }[] = [];
        if (firstKey && lastKey) {
            for (let key: string = firstKey; key <= lastKey; key = shiftMonthKey(key, 1)) {
                data.push({ key, label: monthLabel(key, 'short'), amount: monthlyAmounts.get(key) ?? 0 });
            }
        }

        // Filter by Period
        if (period === '3M') data = data.slice(-3);
        else if (period === '6M') data = data.slice(-6);
        else if (period === '1Y') data = data.slice(-12);

        // --- Metrics Calculation ---
        const currentMonthKey = monthKeyFromDate(new Date());

        // Exclude current month to find "Closed Months"
        const closedMonthsData = data.filter(d => d.key < currentMonthKey);

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

        // The running month is only partly over: it is drawn lighter and marked "so far", so half
        // a month of spending doesn't read as a drop.
        return {
            chartData: data.map(d => ({ ...d, inProgress: d.key === currentMonthKey })),
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

    // Numbers on the latest month and the peak only; the axis and the tooltip carry the rest.
    // The scale covers the average line too — Recharts would quietly widen an axis the line sits
    // above, and the pinned labels would drift off the gridlines.
    const amounts = chartData.map(d => d.amount);
    const barLabels = labelIndices(amounts, { includeMin: false, minGap: chartData.length > 12 ? 2 : 1 });
    const average = metrics?.avg ?? 0;
    const scale = niceScale(0, Math.max(0, ...amounts, average));
    // The right margin holds the average line's label, past the end of the line.
    const chartMargin = { top: 20, right: 52, left: 0, bottom: 0 };
    const barColor = type === 'income' ? '#10b981' : '#f43f5e';
    const runningLabel = chartData.find(d => d.inProgress)?.label;

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm h-auto md:h-[400px] flex flex-col col-span-1 lg:col-span-2">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <h3 className="text-lg font-semibold text-gray-900">Category Trends</h3>

                    {/* Metrics Display */}
                    {metrics && (metrics.lastClosedAmount > 0 || metrics.avg > 0) && (
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

                    {/* Category Selector with Icon and Arrow */}
                    <div className="relative flex items-center bg-gray-50 border border-gray-200 rounded-xl hover:border-emerald-400 hover:bg-white transition-all focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500 group">
                        {selectedCategory && (
                            <div className="pl-3 flex items-center">
                                <div className={cn(
                                    "p-1 rounded-md transition-colors",
                                    stringToColor(selectedCategory).bg,
                                    stringToColor(selectedCategory).text
                                )}>
                                    {(() => {
                                        const Icon = getCategoryIcon(selectedCategory);
                                        return <Icon className="w-4 h-4" />;
                                    })()}
                                </div>
                            </div>
                        )}
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="bg-transparent border-none py-2 pl-2 pr-10 text-sm font-medium text-gray-700 focus:ring-0 focus:outline-none cursor-pointer appearance-none w-full min-w-[140px] md:w-48"
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                            {categories.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                        <div className="absolute right-3 pointer-events-none text-gray-400 group-hover:text-emerald-500 transition-colors">
                            <ChevronDown className="w-4 h-4" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Bars keep a readable width; once the months stop fitting, the plot scrolls
                (opening on the latest ones) under a fixed axis. */}
            <div className="h-[300px] md:h-auto md:flex-1 w-full min-h-0">
                <ScrollableChart
                    points={chartData.length}
                    margin={chartMargin}
                    xAxisHeight={60}
                    yDomain={scale.domain}
                    yTicks={scale.ticks}
                    yTickFormatter={value => (isPrivacyMode ? '•••' : formatShortValue(value))}
                >
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <ComposedChart data={chartData} margin={chartMargin}>
                            <CartesianGrid vertical={false} stroke="#EEF0F3" />
                            <XAxis
                                dataKey="label"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: '#6B7280', fontFamily: 'Inter, sans-serif' }}
                                dy={10}
                                height={60}
                                minTickGap={16}
                            />
                            <YAxis hide domain={scale.domain} ticks={scale.ticks} />
                            <Tooltip
                                content={
                                    <CustomTooltip
                                        isPrivacy={isPrivacyMode}
                                        labelFormatter={label => (label === runningLabel ? `${label} · so far` : label)}
                                    />
                                }
                                cursor={{ fill: 'rgba(249, 250, 251, 0.5)' }}
                            />
                            {/* The average the header compares last month with. It replaces a straight
                                regression line, which read a one-off change (rent after moving) as a
                                steady slide and meant nothing for occasional purchases. */}
                            {average > 0 && (
                                <ReferenceLine
                                    y={average}
                                    stroke="#9CA3AF"
                                    strokeDasharray="5 5"
                                    label={<AverageLineLabel text={isPrivacyMode ? 'avg' : `avg ${formatShortValue(average)}`} />}
                                />
                            )}
                            <Bar
                                dataKey="amount"
                                name={selectedCategory}
                                fill={barColor}
                                radius={[4, 4, 0, 0]}
                                maxBarSize={24}
                                isAnimationActive={false}
                            >
                                {chartData.map(d => (
                                    <Cell key={d.key} fill={barColor} fillOpacity={d.inProgress ? 0.35 : 1} />
                                ))}
                                <LabelList content={<PickedBarLabel picked={barLabels} format={value => (isPrivacyMode ? '' : formatShortValue(value))} />} />
                            </Bar>
                        </ComposedChart>
                    </ResponsiveContainer>
                </ScrollableChart>
            </div>
        </div>
    );
}
