import React, { useMemo, useState } from 'react';
import type { Transaction } from '../types';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../components/ui/table"
import { ArrowUpDown, Search, X } from 'lucide-react';
import { cn, stringToColor } from '../lib/utils';
import { getCategoryIcon } from '../lib/categoryIcons';
import { TransactionListModal } from '../components/TransactionListModal';

interface IncomeInsightsProps {
    transactions: Transaction[];
}

interface CategoryData {
    category: string;
    totalEarned: number;
    currentMonthEarned: number;
    operations: number;
    avgTransaction: number;
    monthlyAvg: number;
    yearForecast: number;
    share: number;
    rank: number;
}

type SortField = keyof CategoryData;
type SortOrder = 'asc' | 'desc';

export const IncomeInsights: React.FC<IncomeInsightsProps> = ({ transactions }) => {
    const [sortField, setSortField] = useState<SortField>('totalEarned');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [searchQuery, setSearchQuery] = useState('');

    const categoryData = useMemo(() => {
        const groups: Record<string, { total: number; count: number }> = {};
        const months = new Set<string>();
        const currentMonthGroups: Record<string, number> = {};

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        // Filter for income ONLY
        const incomeTransactions = transactions.filter(t => t.type === 'income');

        incomeTransactions.forEach(t => {
            if (!groups[t.category]) {
                groups[t.category] = { total: 0, count: 0 };
            }

            const amount = Math.abs(t.amount);
            groups[t.category].total += amount;
            groups[t.category].count += 1;

            const date = new Date(t.date);
            if (!isNaN(date.getTime())) {
                const year = date.getUTCFullYear();
                const month = date.getUTCMonth();
                const monthKey = `${year}-${month}`;
                months.add(monthKey);

                if (year === currentYear && month === currentMonth) {
                    currentMonthGroups[t.category] = (currentMonthGroups[t.category] || 0) + amount;
                }
            }
        });

        const uniqueMonths = months.size || 1;
        const remainingMonths = 11 - currentMonth;

        const grandTotal = Object.values(groups).reduce((acc, curr) => acc + curr.total, 0);

        return Object.entries(groups).map(([category, { total, count }]) => {
            const totalEarned = total;
            const currentMonthEarned = currentMonthGroups[category] || 0;
            const monthlyAvg = totalEarned / uniqueMonths;
            const yearForecast = monthlyAvg * remainingMonths;
            const share = grandTotal > 0 ? (totalEarned / grandTotal) * 100 : 0;

            return {
                category,
                totalEarned,
                currentMonthEarned,
                operations: count,
                avgTransaction: count > 0 ? totalEarned / count : 0,
                monthlyAvg,
                yearForecast,
                share,
                rank: 0
            };
        })
            .sort((a, b) => b.totalEarned - a.totalEarned)
            .map((item, index) => ({ ...item, rank: index + 1 }));
    }, [transactions]);

    // Helper to get breakdown metrics (Tags) for a specific parent row
    const getBreakdownMetrics = (category: string) => {
        const categoryTransactions = transactions.filter(
            t => t.type === 'income' && t.category === category
        );

        const groups: Record<string, { total: number; count: number }> = {};
        const currentMonthGroups: Record<string, number> = {};

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        categoryTransactions.forEach(t => {
            const tag = t.tags || 'No Tag';
            if (!groups[tag]) {
                groups[tag] = { total: 0, count: 0 };
            }
            const amount = Math.abs(t.amount);
            groups[tag].total += amount;
            groups[tag].count += 1;

            const date = new Date(t.date);
            if (!isNaN(date.getTime())) {
                const year = date.getUTCFullYear();
                const month = date.getUTCMonth();
                if (year === currentYear && month === currentMonth) {
                    currentMonthGroups[tag] = (currentMonthGroups[tag] || 0) + amount;
                }
            }
        });

        const remainingMonths = 11 - currentMonth;

        const totalEarnedCategory = Object.values(groups).reduce((acc, curr) => acc + curr.total, 0);

        return Object.entries(groups).map(([tag, { total, count }]) => {
            const totalEarned = total;
            const currentMonthEarned = currentMonthGroups[tag] || 0;
            const monthlyAvg = totalEarned / uniqueMonthsCount;
            const yearForecast = monthlyAvg * remainingMonths;
            const share = totalEarnedCategory > 0 ? (totalEarned / totalEarnedCategory) * 100 : 0; // Share within category

            return {
                name: tag, // standardized name
                tag,       // keep tag for backward compat if needed or just use name
                totalEarned,
                currentMonthEarned,
                operations: count,
                avgTransaction: count > 0 ? totalEarned / count : 0,
                monthlyAvg,
                yearForecast,
                share
            };
        }).sort((a, b) => b.totalEarned - a.totalEarned);
    };

    const sortedData = useMemo(() => {
        let data = [...categoryData].sort((a, b) => {
            // @ts-ignore - dynamic sort
            const aValue = a[sortField] ?? 0;
            // @ts-ignore
            const bValue = b[sortField] ?? 0;

            if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            data = data.filter(item => {
                // Match Category Name
                if (item.category.toLowerCase().includes(query)) return true;

                // Match Tags
                const tags = getBreakdownMetrics(item.category);
                return tags.some(t => t.name.toLowerCase().includes(query));
            });
        }
        return data;
    }, [categoryData, sortField, sortOrder, searchQuery]);

    const handleSort = (field: SortField | 'currentMonthEarned') => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            // @ts-ignore
            setSortField(field);
            setSortOrder('desc');
        }
    };

    const maxTotalEarned = Math.max(...categoryData.map(d => d.totalEarned), 0);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            maximumFractionDigits: 0
        }).format(val);
    };

    const summaryMetrics = useMemo(() => {
        // Only use income transactions
        const income = transactions.filter(t => t.type === 'income');

        if (income.length === 0) return null;

        const monthsMap: Record<string, number> = {};
        let currentYearTotal = 0;
        let lastYearTotal = 0;

        const currentYear = new Date().getFullYear();
        const lastYear = currentYear - 1;

        // Group by month
        income.forEach(t => {
            const amount = Math.abs(t.amount);
            const date = new Date(t.date);
            if (isNaN(date.getTime())) return;

            const year = date.getUTCFullYear();
            const monthKey = `${year}-${date.getUTCMonth()}`;

            monthsMap[monthKey] = (monthsMap[monthKey] || 0) + amount;

            if (year === currentYear) currentYearTotal += amount;
            if (year === lastYear) lastYearTotal += amount;
        });

        const uniqueMonthsCount = Object.keys(monthsMap).length || 1;
        const totalAllTime = Object.values(monthsMap).reduce((a, b) => a + b, 0);
        const avgMonthly = totalAllTime / uniqueMonthsCount;

        // Year Forecast
        const currentMonthIndex = new Date().getMonth();
        const remainingMonths = 11 - currentMonthIndex;
        const yearForecast = currentYearTotal + (avgMonthly * remainingMonths);

        // Last Month vs Avg Trend
        const now = new Date();
        const currentMonth = now.getMonth();
        // currentYear is already defined above

        // Calculate previous month (Last Completed Month)
        let prevMonth = currentMonth - 1;
        let prevMonthYear = currentYear;
        if (prevMonth < 0) {
            prevMonth = 11;
            prevMonthYear -= 1;
        }

        const lastCompletedMonthKey = `${prevMonthYear}-${prevMonth}`;
        const currentMonthKey = `${currentYear}-${currentMonth}`;

        const lastMonthTotal = monthsMap[lastCompletedMonthKey] || 0;

        // Avg of all OTHER months (excluding Last Completed Month AND Current Incomplete Month)
        const otherMonthsTotals = Object.entries(monthsMap)
            .filter(([k]) => k !== lastCompletedMonthKey && k !== currentMonthKey)
            .map(([, v]) => v);

        const avgOthers = otherMonthsTotals.length > 0
            ? otherMonthsTotals.reduce((a, b) => a + b, 0) / otherMonthsTotals.length
            : avgMonthly;

        const trendRatio = avgOthers > 0 ? (lastMonthTotal - avgOthers) / avgOthers : 0;

        return {
            avgMonthly,
            yearForecast,
            lastYearTotal,
            trendRatio,
            lastMonthTotal
        };
    }, [transactions]);


    // State for expanded categories
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

    const toggleExpand = (category: string) => {
        const newExpanded = new Set(expandedCategories);
        if (newExpanded.has(category)) {
            newExpanded.delete(category);
        } else {
            newExpanded.add(category);
        }
        setExpandedCategories(newExpanded);
    };

    // Modal State
    const [selectedTagData, setSelectedTagData] = useState<{ category: string, tag: string, transactions: Transaction[] } | null>(null);

    const handleTagClick = (e: React.MouseEvent, category: string, tag: string) => {
        e.stopPropagation();

        const matchingTransactions = transactions.filter(t => {
            if (t.type !== 'income' || t.category !== category) return false;
            const tTag = t.tags || 'No Tag';
            return tTag === tag;
        });

        setSelectedTagData({
            category,
            tag,
            transactions: matchingTransactions
        });
    };

    // Calculate global unique months for INCOME to be consistent
    const uniqueMonthsCount = useMemo(() => {
        const months = new Set<string>();
        const income = transactions.filter(t => t.type === 'income');
        income.forEach(t => {
            const date = new Date(t.date);
            if (!isNaN(date.getTime())) {
                months.add(`${date.getUTCFullYear()}-${date.getUTCMonth()}`);
            }
        });
        return months.size || 1;
    }, [transactions]);


    // Mobile Card Component for Income Insights
    const IncomeMobileCard = ({ row }: { row: CategoryData }) => {
        const color = stringToColor(row.category);
        const Icon = getCategoryIcon(row.category);
        const [isExpanded, setIsExpanded] = useState(false);
        const subMetrics = isExpanded ? getBreakdownMetrics(row.category) : [];

        return (
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm mb-3">
                <div
                    className="flex justify-between items-start cursor-pointer"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg", color.bg, color.text)}>
                            <Icon className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="font-medium text-gray-900">{row.category}</div>
                            <div className="text-xs text-gray-500">{row.operations} ops</div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="font-bold text-gray-900">{formatCurrency(row.currentMonthEarned)}</div>
                        <div className="text-xs text-gray-400">{row.share.toFixed(1)}%</div>
                    </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                        <span className="text-gray-400 block">Total Earned</span>
                        <span className="font-medium text-gray-900">{formatCurrency(row.totalEarned)}</span>
                    </div>
                    <div>
                        <span className="text-gray-400 block">Monthly Avg</span>
                        <span className="font-medium text-gray-700">{formatCurrency(row.monthlyAvg)}</span>
                    </div>
                </div>

                {/* Expandable Details */}
                {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-50 animate-in fade-in slide-in-from-top-1">
                        <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
                            <div>
                                <span className="text-gray-400 block">Avg Ticket</span>
                                <span className="font-medium text-gray-700">{formatCurrency(row.avgTransaction)}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 block">Year Forecast</span>
                                <span className="font-medium text-gray-700">{formatCurrency(row.yearForecast)}</span>
                            </div>
                        </div>

                        {/* Sub-breakdown (Tags) */}
                        {subMetrics.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-gray-500 uppercase">Tags</p>
                                {subMetrics.map(sub => (
                                    <div key={sub.tag} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                                        <span className="text-gray-600">{sub.tag}</span>
                                        <span className="font-medium text-gray-900">{formatCurrency(sub.currentMonthEarned)}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {subMetrics.length === 0 && (
                            <p className="text-xs text-center text-gray-400 py-2">No tags available</p>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {summaryMetrics && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <p className="text-sm font-medium text-gray-500 mb-2">Avg. Monthly Income</p>
                        <h3 className="text-2xl font-bold text-gray-900">{formatCurrency(summaryMetrics.avgMonthly)}</h3>
                        <p className="text-xs text-gray-400 mt-1">Based on {Object.keys(transactions).length > 0 ? 'all data' : '0'} months</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <p className="text-sm font-medium text-gray-500 mb-2">Year Forecast</p>
                        <h3 className="text-2xl font-bold text-gray-900">{formatCurrency(summaryMetrics.yearForecast)}</h3>
                        <p className="text-xs text-gray-400 mt-1">Estimated total for {new Date().getFullYear()}</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <p className="text-sm font-medium text-gray-500 mb-2">Last Year Income</p>
                        <h3 className="text-2xl font-bold text-gray-900">{formatCurrency(summaryMetrics.lastYearTotal)}</h3>
                        <p className="text-xs text-gray-400 mt-1">{new Date().getFullYear() - 1} Total</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <p className="text-sm font-medium text-gray-500 mb-2">Last Completed Month</p>
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-2xl font-bold text-gray-900">{formatCurrency(summaryMetrics.lastMonthTotal)}</h3>
                            <span className={cn(
                                "text-sm font-medium",
                                // For Income: Positive Trend = Green (Good), Negative Trend = Red (Bad)
                                summaryMetrics.trendRatio > 0 ? "text-emerald-500" : "text-red-500"
                            )}>
                                {summaryMetrics.trendRatio > 0 ? '+' : ''}{(summaryMetrics.trendRatio * 100).toFixed(1)}%
                            </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">vs Average</p>
                    </div>
                </div>
            )}

            <div className="bg-white md:rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-800">Income Breakdown</h3>
                        <p className="text-sm text-gray-500">Analyze your income sources by category</p>
                    </div>

                    {/* Search Input */}
                    <div className="relative w-full sm:w-auto">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search categories or tags..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 pr-8 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent w-full sm:w-64 transition-all"
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

                {/* Mobile View: Cards */}
                <div className="md:hidden p-4 bg-gray-50/50">
                    {sortedData.map((row) => (
                        <IncomeMobileCard key={row.category} row={row} />
                    ))}
                    {sortedData.length === 0 && (
                        <div className="text-center py-12 text-gray-400 text-sm">No categories found</div>
                    )}
                </div>

                {/* Desktop View: Table */}
                <div className="hidden md:block">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                                <TableHead className="w-[250px] cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('category')}>
                                    <div className="flex items-center gap-1">
                                        Category
                                        {sortField === 'category' && <ArrowUpDown className="w-3 h-3" />}
                                    </div>
                                </TableHead>
                                {/* This Month (New) */}
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors bg-emerald-50/30 rounded-lg" onClick={() => handleSort('currentMonthEarned')}>
                                    <div className="flex items-center justify-end gap-1 font-semibold text-emerald-900">
                                        This Month
                                        {sortField === 'currentMonthEarned' && <ArrowUpDown className="w-3 h-3" />}
                                    </div>
                                </TableHead>

                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('monthlyAvg')}>
                                    <div className="flex items-center justify-end gap-1">
                                        Monthly Avg
                                        {sortField === 'monthlyAvg' && <ArrowUpDown className="w-3 h-3" />}
                                    </div>
                                </TableHead>
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors bg-emerald-50/30 rounded-lg" onClick={() => handleSort('totalEarned')}>
                                    <div className="flex items-center justify-end gap-1 font-semibold text-emerald-900">
                                        Total Earned
                                        {sortField === 'totalEarned' && <ArrowUpDown className="w-3 h-3" />}
                                    </div>
                                </TableHead>
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('share')}>
                                    <div className="flex items-center justify-end gap-1">
                                        % Share
                                        {sortField === 'share' && <ArrowUpDown className="w-3 h-3" />}
                                    </div>
                                </TableHead>
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('operations')}>
                                    <div className="flex items-center justify-end gap-1">
                                        Ops
                                        {sortField === 'operations' && <ArrowUpDown className="w-3 h-3" />}
                                    </div>
                                </TableHead>
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('avgTransaction')}>
                                    <div className="flex items-center justify-end gap-1">
                                        Avg. Ticket
                                        {sortField === 'avgTransaction' && <ArrowUpDown className="w-3 h-3" />}
                                    </div>
                                </TableHead>
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('yearForecast')}>
                                    <div className="flex items-center justify-end gap-1">
                                        Forecast (Rem. Year)
                                        {sortField === 'yearForecast' && <ArrowUpDown className="w-3 h-3" />}
                                    </div>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedData.map((row) => (
                                <React.Fragment key={row.category}>
                                    <TableRow
                                        className="hover:bg-gray-50/50 cursor-pointer"
                                        onClick={() => toggleExpand(row.category)}
                                    >
                                        <TableCell className="font-medium text-gray-900">
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-400 w-4">
                                                    {(expandedCategories.has(row.category) || (searchQuery && getBreakdownMetrics(row.category).some(t => t.name.toLowerCase().includes(searchQuery.toLowerCase())))) ? '▼' : '▶'}
                                                </span>
                                                {(() => {
                                                    const color = stringToColor(row.category);
                                                    const Icon = getCategoryIcon(row.category);
                                                    return (
                                                        <span className={cn(
                                                            "flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium w-fit",
                                                            color.bg,
                                                            color.text
                                                        )}>
                                                            <Icon className="w-3.5 h-3.5" />
                                                            {row.category}
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-gray-900 bg-emerald-50/10 rounded-lg">
                                            {formatCurrency(row.currentMonthEarned)}
                                        </TableCell>
                                        <TableCell className="text-right text-gray-500">{formatCurrency(row.monthlyAvg)}</TableCell>
                                        <TableCell className="text-right relative bg-emerald-50/10 rounded-lg">
                                            <div className="relative z-10 font-bold text-gray-900">
                                                {formatCurrency(row.totalEarned)}
                                            </div>
                                            {/* Progress Bar Background */}
                                            <div
                                                className="absolute left-0 top-2 bottom-2 rounded-r-md transition-all duration-500"
                                                style={{
                                                    width: `${(row.totalEarned / maxTotalEarned) * 100}%`,
                                                    opacity: 0.1,
                                                    backgroundColor: 'currentColor', // Use row color or default? Let's use emerald
                                                }}
                                            >
                                                <div className="w-full h-full bg-emerald-500 rounded-r-md" />
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right text-gray-500 font-medium">{row.share.toFixed(1)}%</TableCell>
                                        <TableCell className="text-right text-gray-500">{row.operations}</TableCell>
                                        <TableCell className="text-right text-gray-500">{formatCurrency(row.avgTransaction)}</TableCell>
                                        <TableCell className="text-right text-gray-400">
                                            {row.yearForecast > 0 ? formatCurrency(row.yearForecast) : '—'}
                                        </TableCell>
                                    </TableRow>

                                    {/* Expanded Tag View */}
                                    {expandedCategories.has(row.category) && (
                                        <TableRow className="bg-gray-50/50">
                                            <TableCell colSpan={8} className="p-0">
                                                <div className="pl-12 pr-4 py-4 border-l-4 border-emerald-100 ml-6 my-2 bg-white/50 rounded-r-lg">
                                                    <table className="w-full text-sm">
                                                        <thead>
                                                            <tr className="text-gray-400 text-xs uppercase tracking-wider border-b border-gray-100">
                                                                <th className="text-left py-2 font-medium">Tag</th>
                                                                <th className="text-right py-2 font-medium">This Month</th>
                                                                <th className="text-right py-2 font-medium">Monthly Avg</th>
                                                                <th className="text-right py-2 font-medium">Total Earned</th>
                                                                <th className="text-right py-2 font-medium">% Share</th>
                                                                <th className="text-right py-2 font-medium">Ops</th>
                                                                <th className="text-right py-2 font-medium">Avg. Ticket</th>
                                                                <th className="text-right py-2 font-medium">Forecast</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-50">
                                                            {getBreakdownMetrics(row.category).map(tagRow => (
                                                                <tr key={tagRow.tag} className="hover:bg-gray-100/50 transition-colors">
                                                                    <td className="py-2.5 text-gray-600">
                                                                        <div
                                                                            className="flex items-center gap-2 cursor-pointer hover:text-emerald-600 transition-colors group font-medium w-fit"
                                                                            onClick={(e) => handleTagClick(e, row.category, tagRow.tag)}
                                                                        >
                                                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-200 group-hover:bg-emerald-500 transition-colors"></div>
                                                                            {tagRow.tag}
                                                                        </div>
                                                                    </td>
                                                                    <td className="text-right py-2.5 font-medium text-emerald-700">{formatCurrency(tagRow.currentMonthEarned)}</td>
                                                                    <td className="text-right py-2.5 text-gray-500">{formatCurrency(tagRow.monthlyAvg)}</td>
                                                                    <td className="text-right py-2.5 text-gray-700">{formatCurrency(tagRow.totalEarned)}</td>
                                                                    <td className="text-right py-2.5 text-gray-500 font-medium">{tagRow.share.toFixed(1)}%</td>
                                                                    <td className="text-right py-2.5 text-gray-500">{tagRow.operations}</td>
                                                                    <td className="text-right py-2.5 text-gray-500">{formatCurrency(tagRow.avgTransaction)}</td>
                                                                    <td className="text-right py-2.5 text-gray-400">{tagRow.yearForecast > 0 ? formatCurrency(tagRow.yearForecast) : '—'}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                    {getBreakdownMetrics(row.category).length === 0 && (
                                                        <div className="text-center py-4 text-gray-400 text-xs italic">
                                                            No tags found for this category
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </React.Fragment>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {selectedTagData && (
                <TransactionListModal
                    isOpen={!!selectedTagData}
                    onClose={() => setSelectedTagData(null)}
                    category={selectedTagData.category}
                    tag={selectedTagData.tag}
                    transactions={selectedTagData.transactions}
                />
            )}
        </div>
    );
};
