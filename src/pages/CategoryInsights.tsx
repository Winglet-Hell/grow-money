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
import { ArrowUpDown, TrendingUp, Wallet, AlertCircle, Calendar, Search, X } from 'lucide-react';
import { cn, stringToColor } from '../lib/utils';
import { getCategoryIcon } from '../lib/categoryIcons';
import { TransactionListModal } from '../components/TransactionListModal';
import { getGlobalCategory } from '../lib/categoryGroups';

interface CategoryInsightsProps {
    transactions: Transaction[];
}

interface CategoryData {
    category: string;
    totalSpent: number;
    operations: number;
    avgTransaction: number;
    monthlyAvg: number;
    currentMonthSpent: number;
    yearForecast: number;
    share: number;
    limit?: number;
    remaining: number | null;
    rank: number;
}

type SortField = keyof CategoryData | 'limit';
type SortOrder = 'asc' | 'desc';
type ViewMode = 'category' | 'global';

import { useCategoryLimits } from '../hooks/useCategoryLimits';
import { CategoryLimitModal } from '../components/CategoryLimitModal';

export const CategoryInsights: React.FC<CategoryInsightsProps> = ({ transactions }) => {
    const [sortField, setSortField] = useState<SortField>('totalSpent');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [viewMode, setViewMode] = useState<ViewMode>('category'); // Default to Detailed View
    const [searchQuery, setSearchQuery] = useState('');

    // Calculate global unique completed months for consistent averaging
    const uniqueMonthsCount = useMemo(() => {
        const months = new Set<string>();
        const relevantTransactions = transactions.filter(t => t.type === 'expense');

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        relevantTransactions.forEach(t => {
            const date = new Date(t.date);
            if (!isNaN(date.getTime())) {
                const year = date.getUTCFullYear();
                const month = date.getUTCMonth();

                // Exclude current incomplete month and future dates
                if (year < currentYear || (year === currentYear && month < currentMonth)) {
                    months.add(`${year}-${month}`);
                }
            }
        });
        return months.size || 1;
    }, [transactions]);

    const { limits, setLimit, removeLimit, getLimit } = useCategoryLimits();
    const [limitModalData, setLimitModalData] = useState<{ category: string, currentLimit?: number } | null>(null);

    const categoryData = useMemo(() => {
        const groups: Record<string, { total: number; count: number }> = {};

        // Filter for expenses ONLY
        const expenseTransactions = transactions.filter(t => t.type === 'expense');

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        expenseTransactions.forEach(t => {
            // Determine key based on View Mode
            const key = viewMode === 'global' ? getGlobalCategory(t.category) : t.category;

            if (!groups[key]) {
                groups[key] = { total: 0, count: 0 };
            }
            groups[key].total += Math.abs(t.amount);
            groups[key].count += 1;
        });

        // Calculate Average using COMPLETED months only
        // We need to re-aggregate for averages to exclude current month data
        const completedGroups: Record<string, number> = {};
        const currentMonthGroups: Record<string, number> = {};

        // Track which detailed categories belong to which group key (for limit aggregation)
        const groupConstituents: Record<string, Set<string>> = {};

        expenseTransactions.forEach(t => {
            const date = new Date(t.date);
            const year = date.getUTCFullYear();
            const month = date.getUTCMonth();
            const key = viewMode === 'global' ? getGlobalCategory(t.category) : t.category;

            // Track constituents
            if (!groupConstituents[key]) {
                groupConstituents[key] = new Set();
            }
            groupConstituents[key].add(t.category);

            // Check if transaction is in a completed month
            if (year < currentYear || (year === currentYear && month < currentMonth)) {
                if (!completedGroups[key]) completedGroups[key] = 0;
                completedGroups[key] += Math.abs(t.amount);
            }
            // Check if transaction is in the CURRENT month
            if (year === currentYear && month === currentMonth) {
                if (!currentMonthGroups[key]) currentMonthGroups[key] = 0;
                currentMonthGroups[key] += Math.abs(t.amount);
            }
        });

        // const currentMonth = new Date().getMonth(); // Already defined above
        const remainingMonths = 11 - currentMonth;

        const grandTotal = Object.values(groups).reduce((acc, curr) => acc + curr.total, 0);

        return Object.entries(groups).map(([category, { total, count }]) => {
            const totalSpent = total;
            // Use completed total for average, fallback to total if 0 (e.g. new category this month)
            // But if we have 0 completed months, uniqueMonthsCount is 1.
            const totalSpentCompleted = completedGroups[category] || 0;
            const currentMonthSpent = currentMonthGroups[category] || 0;
            const monthlyAvg = totalSpentCompleted / uniqueMonthsCount;
            const yearForecast = monthlyAvg * remainingMonths;
            const share = grandTotal > 0 ? (totalSpent / grandTotal) * 100 : 0;

            // Calculate Limit
            let limit: number | undefined = 0;
            if (viewMode === 'global') {
                // Sum limits of all constituents
                const constituents = groupConstituents[category] || new Set();
                let hasAnyLimit = false;
                const sum = Array.from(constituents).reduce((acc, cat) => {
                    const l = getLimit(cat);
                    if (l !== undefined) {
                        hasAnyLimit = true;
                        return acc + l;
                    }
                    return acc;
                }, 0);
                limit = hasAnyLimit ? sum : undefined;
            } else {
                limit = getLimit(category);
            }

            const remaining = limit ? limit - currentMonthSpent : null;

            return {
                category,
                totalSpent,
                operations: count,
                avgTransaction: count > 0 ? totalSpent / count : 0,
                monthlyAvg,
                currentMonthSpent,
                yearForecast,
                share,
                limit,
                remaining,
                // Rank will be assigned after sorting by totalSpent descending
                rank: 0
            };
        })
            .sort((a, b) => b.totalSpent - a.totalSpent) // Initial sort to assign rank
            .map((item, index) => ({ ...item, rank: index + 1 })); // Assign static rank
    }, [transactions, uniqueMonthsCount, viewMode, limits]);






    const maxTotalSpent = Math.max(...categoryData.map(d => d.totalSpent), 0);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            maximumFractionDigits: 0
        }).format(val);
    };

    const summaryMetrics = useMemo(() => {
        // Only use expense transactions
        const expenses = transactions.filter(t => t.type === 'expense');

        if (expenses.length === 0) return null;

        const monthsMap: Record<string, number> = {};
        let currentYearTotal = 0;
        let lastYearTotal = 0;

        const currentYear = new Date().getFullYear();
        const lastYear = currentYear - 1;

        // Group by month
        expenses.forEach(t => {
            const amount = Math.abs(t.amount); // Treat expenses as positive magnitude
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

        // Calculate Avg Monthly (Completed Months Only)
        // exclude current month from avg calc
        const currentMonthKey = `${currentYear}-${new Date().getMonth()}`;

        let totalCompleted = 0;
        let countCompleted = 0;

        Object.entries(monthsMap).forEach(([key, val]) => {
            if (key !== currentMonthKey) {
                totalCompleted += val;
                countCompleted++;
            }
        });

        const avgMonthly = countCompleted > 0 ? totalCompleted / countCompleted : totalAllTime / uniqueMonthsCount;

        // Year Forecast
        // Logic: Already spent this year + (Avg Monthly * Remaining Months in Year)
        // Or if we have data for specific months of this year, we use them.
        const currentMonthIndex = new Date().getMonth(); // 0 = Jan
        const remainingMonths = 11 - currentMonthIndex;
        // Forecast = Current Year Total + (Avg Monthly * Remaining Months)
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
        // const currentMonthKey = `${currentYear}-${currentMonth}`; // Already defined above

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

        // Note: The filter above for tags needs to match the grouping logic in getTagMetrics.
        // In getTagMetrics: const tag = t.tags || 'No Tag';
        // But what if multiple tags? `t.tags` is a string like "Tag1, Tag2".
        // In parser.ts we split and join.
        // Wait, `getTagMetrics` logic at line ~320: `const tag = t.tags || 'No Tag';`. 
        // This implies `t.tags` is treated as a single string key for grouping.
        // If the parser normalized it, it might be "Tag1, Tag2".
        // So the click handler should look for exact match if that's how we grouped.
        // Let's stick to simple exact match first.

        const matchingTransactions = transactions.filter(t => {
            if (t.type !== 'expense' || t.category !== category) return false;
            const tTag = t.tags || 'No Tag';
            return tTag === tag;
        });

        setSelectedTagData({
            category,
            tag,
            transactions: matchingTransactions
        });
    };

    // Helper to get breakdown metrics (Subcategories or Tags) for a specific parent row
    const getBreakdownMetrics = (parentCategory: string) => {
        // Filter transactions belonging to this parent
        const parentTransactions = transactions.filter(t => {
            if (t.type !== 'expense') return false;

            if (viewMode === 'global') {
                return getGlobalCategory(t.category) === parentCategory;
            } else {
                return t.category === parentCategory;
            }
        });

        const groups: Record<string, { total: number; count: number }> = {};
        const currentMonthGroups: Record<string, number> = {};
        const completedGroups: Record<string, number> = {};

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonthIdx = now.getMonth();

        parentTransactions.forEach(t => {
            // If Global Mode -> Breakdown by Category
            // If Category Mode -> Breakdown by Tag
            const key = viewMode === 'global' ? t.category : (t.tags || 'No Tag');

            // Aggregate Total
            if (!groups[key]) {
                groups[key] = { total: 0, count: 0 };
            }
            groups[key].total += Math.abs(t.amount);
            groups[key].count += 1;

            // Aggregate Completed Months Only
            const date = new Date(t.date);
            const year = date.getUTCFullYear();
            const month = date.getUTCMonth();

            if (year < currentYear || (year === currentYear && month < currentMonthIdx)) {
                if (!completedGroups[key]) completedGroups[key] = 0;
                completedGroups[key] += Math.abs(t.amount);
            }

            // Aggregate Current Month
            if (year === currentYear && month === currentMonthIdx) {
                if (!currentMonthGroups[key]) currentMonthGroups[key] = 0;
                currentMonthGroups[key] += Math.abs(t.amount);
            }
        });

        // Current month logic for forecast (same as main)
        const currentMonth = new Date().getMonth();
        const remainingMonths = 11 - currentMonth;

        const totalParentSpent = Object.values(groups).reduce((acc, curr) => acc + curr.total, 0);

        return Object.entries(groups).map(([key, { total, count }]) => {
            const totalSpent = total;
            const totalSpentCompleted = completedGroups[key] || 0;
            const currentMonthSpent = currentMonthGroups[key] || 0;
            const monthlyAvg = totalSpentCompleted / uniqueMonthsCount;
            const yearForecast = monthlyAvg * remainingMonths;
            const share = totalParentSpent > 0 ? (totalSpent / totalParentSpent) * 100 : 0;

            return {
                name: key, // Rename 'tag' to 'name' for generic use
                totalSpent,
                operations: count,
                avgTransaction: count > 0 ? totalSpent / count : 0,
                monthlyAvg,
                yearForecast,
                currentMonthSpent,
                share
            };
        }).sort((a, b) => b.totalSpent - a.totalSpent);
    };

    // Sorted Data Logic (Moved after getBreakdownMetrics)
    const sortedData = useMemo(() => {
        let data = [...categoryData].sort((a, b) => {
            const aValue = a[sortField] ?? 0;
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
    }, [categoryData, sortField, sortOrder, searchQuery]); // transactions/viewMode are deps of getBreakdownMetrics implicitly if it's not wrapped in useCallback, so better to wrap it or include deps.
    // Ideally getBreakdownMetrics should be wrapped in useCallback.
    // But since this is a functional component re-render, getBreakdownMetrics is recreated every render.
    // So useMemo will run every render if we don't be careful.
    // For now, given the simplicity, it's acceptable, but `categoryData` changes rarely (on transaction update).
    // Let's leave it as is for now, it's "fast enough".

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    // --- Infographics Calculations ---
    const infographics = useMemo(() => {
        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const daysPassed = now.getDate();
        const daysRemaining = daysInMonth - daysPassed + 1;

        // 1. Budget Health
        // Summing `currentMonthSpent` from `categoryData` gives total spent in current month matching the table.
        // Summing `limit` from `categoryData` gives total limit matching the table.

        const totalSpentCurrentMonth = categoryData.reduce((acc, item) => acc + item.currentMonthSpent, 0);
        const totalLimit = categoryData.reduce((acc, item) => acc + (item.limit || 0), 0);

        const overallRemaining = totalLimit - totalSpentCurrentMonth;
        const progressPercent = totalLimit > 0 ? (totalSpentCurrentMonth / totalLimit) * 100 : 0;

        // 2. Daily Pace
        const avgDailySpend = totalSpentCurrentMonth / Math.max(daysPassed, 1);
        // Safe daily spend to stick to budget: Remaining / Remaining Days
        const safeDailySpend = totalLimit > 0 ? (Math.max(overallRemaining, 0) / Math.max(daysRemaining, 1)) : 0;

        // 3. Top Spender
        const sortedBySpend = [...categoryData].sort((a, b) => b.currentMonthSpent - a.currentMonthSpent);
        const topCategory = sortedBySpend[0];

        return {
            totalSpentCurrentMonth,
            totalLimit,
            overallRemaining,
            progressPercent,
            avgDailySpend,
            safeDailySpend,
            topCategory
        };
    }, [categoryData]);

    // Mobile Card Component for Category Insights
    const CategoryMobileCard = ({ row }: { row: CategoryData }) => {
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
                        <div className="font-bold text-gray-900">{formatCurrency(row.currentMonthSpent)}</div>
                        <div className="text-xs text-gray-400">{row.share.toFixed(1)}%</div>
                    </div>
                </div>

                {/* Limit Progress Bar if Limit exists */}
                {row.limit && row.limit > 0 && (
                    <div className="mt-3">
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-500">Limit: {formatCurrency(row.limit)}</span>
                            <span className={cn(
                                "font-medium",
                                (row.remaining || 0) < 0 ? "text-red-500" : "text-emerald-600"
                            )}>
                                {(row.remaining || 0) < 0 ? 'Over: ' : 'Left: '}
                                {formatCurrency(Math.abs(row.remaining || 0))}
                            </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div
                                className={cn(
                                    "h-full rounded-full",
                                    (row.remaining || 0) < 0 ? "bg-red-500" : "bg-emerald-500"
                                )}
                                style={{ width: `${Math.min((row.currentMonthSpent / row.limit) * 100, 100)}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Expandable Details */}
                {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-50 animate-in fade-in slide-in-from-top-1">
                        <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
                            <div>
                                <span className="text-gray-400 block">Monthly Avg</span>
                                <span className="font-medium text-gray-700">{formatCurrency(row.monthlyAvg)}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 block">Total Spent</span>
                                <span className="font-medium text-gray-700">{formatCurrency(row.totalSpent)}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 block">Avg Ticket</span>
                                <span className="font-medium text-gray-700">{formatCurrency(row.avgTransaction)}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 block">Year Forecast</span>
                                <span className="font-medium text-gray-700">{formatCurrency(row.yearForecast)}</span>
                            </div>
                        </div>

                        {/* Sub-breakdown (Tags or Categories) */}
                        {subMetrics.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-gray-500 uppercase">Breakdown</p>
                                {subMetrics.map(sub => (
                                    <div key={sub.name} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                                        <span className="text-gray-600">{sub.name}</span>
                                        <span className="font-medium text-gray-900">{formatCurrency(sub.currentMonthSpent)}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {subMetrics.length === 0 && (
                            <p className="text-xs text-center text-gray-400 py-2">No further breakdown available</p>
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
                        <p className="text-sm font-medium text-gray-500 mb-2">Avg. Monthly Spending</p>
                        <h3 className="text-2xl font-bold text-gray-900">{formatCurrency(summaryMetrics.avgMonthly)}</h3>
                        <p className="text-xs text-gray-400 mt-1">Based on {Object.keys(transactions).length > 0 ? 'all data' : '0'} months</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <p className="text-sm font-medium text-gray-500 mb-2">Year Forecast</p>
                        <h3 className="text-2xl font-bold text-gray-900">{formatCurrency(summaryMetrics.yearForecast)}</h3>
                        <p className="text-xs text-gray-400 mt-1">Estimated total for {new Date().getFullYear()}</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <p className="text-sm font-medium text-gray-500 mb-2">Last Year Spending</p>
                        <h3 className="text-2xl font-bold text-gray-900">{formatCurrency(summaryMetrics.lastYearTotal)}</h3>
                        <p className="text-xs text-gray-400 mt-1">{new Date().getFullYear() - 1} Total</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <p className="text-sm font-medium text-gray-500 mb-2">Last Completed Month</p>
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-2xl font-bold text-gray-900">{formatCurrency(summaryMetrics.lastMonthTotal)}</h3>
                            <span className={cn(
                                "text-sm font-medium",
                                summaryMetrics.trendRatio > 0 ? "text-red-500" : "text-emerald-500"
                            )}>
                                {summaryMetrics.trendRatio > 0 ? '+' : ''}{(summaryMetrics.trendRatio * 100).toFixed(1)}%
                            </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">vs Average</p>
                    </div>
                </div>
            )}

            {/* Infographics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
                {/* 1. Budget Health */}
                <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-500">Overall Budget</span>
                            <Wallet className="w-4 h-4 text-emerald-500" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold text-gray-900">
                                {infographics.totalLimit > 0 ? Math.round(infographics.progressPercent) + '%' : '—'}
                            </span>
                            <span className="text-sm text-gray-500">used</span>
                        </div>
                        <div className="mt-1 text-sm text-gray-600">
                            {formatCurrency(infographics.totalSpentCurrentMonth)} <span className="text-gray-400">/ {formatCurrency(infographics.totalLimit)}</span>
                        </div>
                    </div>
                    <div className="mt-4 w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                            className={cn(
                                "h-full rounded-full transition-all duration-500",
                                infographics.progressPercent > 100 ? "bg-red-500" : (infographics.progressPercent > 80 ? "bg-yellow-500" : "bg-emerald-500")
                            )}
                            style={{ width: `${Math.min(infographics.progressPercent, 100)}%` }}
                        />
                    </div>
                </div>

                {/* 2. Daily Pace */}
                <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-500">Daily Pace</span>
                            <Calendar className="w-4 h-4 text-blue-500" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className={cn(
                                "text-2xl font-bold",
                                (infographics.totalLimit > 0 && infographics.avgDailySpend > infographics.safeDailySpend) ? "text-red-500" : "text-gray-900"
                            )}>
                                {formatCurrency(infographics.avgDailySpend)}
                            </span>
                            <span className="text-sm text-gray-500">/ day</span>
                        </div>
                        <div className="mt-1 text-sm text-gray-600">
                            {infographics.totalLimit > 0 ? (
                                <>
                                    Safe limit: <span className="font-medium text-emerald-600">{formatCurrency(infographics.safeDailySpend)}</span>
                                </>
                            ) : (
                                <span className="text-gray-400">Set limits to see pace</span>
                            )}
                        </div>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-xs font-medium">
                        {infographics.totalLimit > 0 ? (
                            infographics.avgDailySpend > infographics.safeDailySpend ? (
                                <span className="text-red-500 flex items-center gap-1">
                                    <TrendingUp className="w-3 h-3" /> Over budget pace
                                </span>
                            ) : (
                                <span className="text-emerald-500 flex items-center gap-1">
                                    <TrendingUp className="w-3 h-3 rotate-180" /> Good pace
                                </span>
                            )
                        ) : <span className="text-gray-300">—</span>}
                    </div>
                </div>

                {/* 3. Top Spender */}
                <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-500">Top Spender</span>
                            <AlertCircle className="w-4 h-4 text-orange-500" />
                        </div>
                        {infographics.topCategory ? (
                            <>
                                <div className="flex items-center gap-2 mb-1">
                                    {(() => {
                                        const Icon = getCategoryIcon(infographics.topCategory.category);
                                        const color = stringToColor(infographics.topCategory.category);
                                        return (
                                            <div className={cn("p-1.5 rounded-lg", color.bg, color.text)}>
                                                <Icon className="w-4 h-4" />
                                            </div>
                                        );
                                    })()}
                                    <div className="text-lg font-bold text-gray-900 truncate" title={infographics.topCategory.category}>
                                        {infographics.topCategory.category}
                                    </div>
                                </div>
                                <div className="mt-1 text-2xl font-bold text-gray-900">
                                    {formatCurrency(infographics.topCategory.currentMonthSpent)}
                                </div>
                                <div className="mt-1 text-sm text-gray-500">
                                    {infographics.totalSpentCurrentMonth > 0
                                        ? ((infographics.topCategory.currentMonthSpent / infographics.totalSpentCurrentMonth) * 100).toFixed(1) + '% of total'
                                        : '0%'}
                                </div>
                            </>
                        ) : (
                            <div className="text-gray-400 italic">No spending yet</div>
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-white md:rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-800">Spending Breakdown</h3>
                        <p className="text-sm text-gray-500">Analyze your spending by {viewMode === 'global' ? 'category group' : 'category'}</p>
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

                    {/* View Toggle */}
                    <div className="flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto">
                        <button
                            onClick={() => {
                                setViewMode('category');
                                setExpandedCategories(new Set()); // Clear expansion
                            }}
                            className={cn(
                                "flex-1 sm:flex-none px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                                viewMode === 'category' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                            )}
                        >
                            Detailed
                        </button>
                        <button
                            onClick={() => {
                                setViewMode('global');
                                setExpandedCategories(new Set()); // Clear expansion
                            }}
                            className={cn(
                                "flex-1 sm:flex-none px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                                viewMode === 'global' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                            )}
                        >
                            Global
                        </button>
                    </div>
                </div>

                {/* Mobile View: Cards */}
                <div className="md:hidden p-4 bg-gray-50/50">
                    {sortedData.map((row) => (
                        <CategoryMobileCard key={row.category} row={row} />
                    ))}
                    {sortedData.length === 0 && (
                        <div className="text-center py-12 text-gray-400 text-sm">No categories found</div>
                    )}
                </div>

                {/* Desktop View: Table */}
                <div className="hidden md:block">
                    <Table>
                        <TableHeader>
                            <TableRow className="sticky top-0 z-20 bg-gray-50 hover:bg-gray-50 shadow-sm border-b border-gray-200">
                                <TableHead className="w-[220px] cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('category')}>
                                    <div className="flex items-center gap-1">
                                        {viewMode === 'global' ? 'Global Category' : 'Category'}
                                        {sortField === 'category' && <ArrowUpDown className="w-3 h-3" />}
                                    </div>
                                </TableHead>

                                {/* Current Budget Group */}
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors bg-emerald-50/30" onClick={() => handleSort('currentMonthSpent')}>
                                    <div className="flex items-center justify-end gap-1 font-semibold text-emerald-900">
                                        This Month
                                        {sortField === 'currentMonthSpent' && <ArrowUpDown className="w-3 h-3" />}
                                    </div>
                                </TableHead>
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors bg-emerald-50/30" onClick={() => handleSort('limit')}>
                                    <div className="flex items-center justify-end gap-1 font-semibold text-emerald-900">
                                        Limit
                                        {sortField === 'limit' && <ArrowUpDown className="w-3 h-3" />}
                                    </div>
                                </TableHead>
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors bg-emerald-50/30" onClick={() => handleSort('remaining' as SortField)}>
                                    <div className="flex items-center justify-end gap-1 font-semibold text-emerald-900">
                                        Left
                                        {sortField === ('remaining' as SortField) && <ArrowUpDown className="w-3 h-3" />}
                                    </div>
                                </TableHead>

                                {/* Historical Context */}
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('monthlyAvg')}>
                                    <div className="flex items-center justify-end gap-1 text-gray-600">
                                        Monthly Avg
                                        {sortField === 'monthlyAvg' && <ArrowUpDown className="w-3 h-3" />}
                                    </div>
                                </TableHead>
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('totalSpent')}>
                                    <div className="flex items-center justify-end gap-1 text-gray-600">
                                        Total Spent
                                        {sortField === 'totalSpent' && <ArrowUpDown className="w-3 h-3" />}
                                    </div>
                                </TableHead>
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('share')}>
                                    <div className="flex items-center justify-end gap-1 text-gray-600">
                                        %
                                        {sortField === 'share' && <ArrowUpDown className="w-3 h-3" />}
                                    </div>
                                </TableHead>

                                {/* Details (Smaller/Lighter) */}
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors text-xs text-gray-400 font-normal" onClick={() => handleSort('operations')}>
                                    <div className="flex items-center justify-end gap-1">
                                        Ops
                                        {sortField === 'operations' && <ArrowUpDown className="w-3 h-3" />}
                                    </div>
                                </TableHead>
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors text-xs text-gray-400 font-normal" onClick={() => handleSort('avgTransaction')}>
                                    <div className="flex items-center justify-end gap-1">
                                        Avg. Tkt
                                        {sortField === 'avgTransaction' && <ArrowUpDown className="w-3 h-3" />}
                                    </div>
                                </TableHead>
                                <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors text-xs text-gray-400 font-normal" onClick={() => handleSort('yearForecast')}>
                                    <div className="flex items-center justify-end gap-1">
                                        Forecast
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
                                                    {/* Auto-expand if search query matches any sub-tag, otherwise use manual state */}
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

                                        {/* Current Budget Group */}
                                        <TableCell className="text-right font-bold text-gray-900 bg-emerald-50/10">
                                            {formatCurrency(row.currentMonthSpent)}
                                        </TableCell>
                                        <TableCell
                                            className={cn(
                                                "text-right relative overflow-hidden bg-emerald-50/10",
                                                viewMode === 'category' ? "cursor-pointer hover:bg-gray-100 transition-colors group" : ""
                                            )}
                                            onClick={(e) => {
                                                if (viewMode === 'category') {
                                                    e.stopPropagation();
                                                    setLimitModalData({ category: row.category, currentLimit: row.limit });
                                                }
                                            }}
                                        >
                                            {row.limit && (
                                                <div
                                                    className={cn(
                                                        "absolute right-0 top-2 bottom-2 rounded-l-md transition-all duration-500 opacity-20",
                                                        row.currentMonthSpent > row.limit ? "bg-red-500" :
                                                            (row.currentMonthSpent / row.limit > 0.8 ? "bg-yellow-500" : "bg-emerald-500")
                                                    )}
                                                    style={{
                                                        width: `${Math.min((row.currentMonthSpent / row.limit) * 100, 100)}%`
                                                    }}
                                                />
                                            )}
                                            <div className={cn(
                                                "relative z-10 font-medium",
                                                row.limit && row.currentMonthSpent > row.limit ? "text-red-600" : "text-gray-500"
                                            )}>
                                                {row.limit ? formatCurrency(row.limit) : (
                                                    viewMode === 'category' ? <span className="text-gray-300 text-xs opacity-0 group-hover:opacity-100 transition-opacity">Set Limit</span> : <span className="text-gray-300 text-xs">—</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right bg-emerald-50/10">
                                            {row.remaining !== null ? (
                                                <span className={cn(
                                                    "font-bold",
                                                    row.remaining < 0 ? "text-red-600" : "text-emerald-700"
                                                )}>
                                                    {formatCurrency(row.remaining)}
                                                </span>
                                            ) : (
                                                <span className="text-gray-300 text-xs">—</span>
                                            )}
                                        </TableCell>

                                        {/* Historical Context */}
                                        <TableCell className="text-right text-gray-600 font-medium">{formatCurrency(row.monthlyAvg)}</TableCell>
                                        <TableCell className="text-right relative">
                                            <div className="relative z-10 text-gray-600">
                                                {formatCurrency(row.totalSpent)}
                                            </div>
                                            <div
                                                className="absolute left-0 top-2 bottom-2 rounded-r-md transition-all duration-500"
                                                style={{
                                                    width: `${(row.totalSpent / maxTotalSpent) * 100}%`,
                                                    opacity: 0.1,
                                                    backgroundColor: 'currentColor'
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell className="text-right text-gray-500 font-medium">{row.share.toFixed(1)}%</TableCell>

                                        {/* Details */}
                                        <TableCell className="text-right text-gray-400 text-xs">{row.operations}</TableCell>
                                        <TableCell className="text-right text-gray-400 text-xs">{formatCurrency(row.avgTransaction)}</TableCell>
                                        <TableCell className="text-right text-gray-400 text-xs">
                                            {row.yearForecast > 0 ? formatCurrency(row.yearForecast) : '—'}
                                        </TableCell>
                                    </TableRow>

                                    {/* Expanded Tag View */}
                                    {/* Show if manually expanded OR if search query matches something inside (and not just the category name itself, though likely we want to show it then too) */}
                                    {(expandedCategories.has(row.category) || (searchQuery && getBreakdownMetrics(row.category).some(t => t.name.toLowerCase().includes(searchQuery.toLowerCase())))) && (
                                        <TableRow className="bg-gray-50/50">
                                            <TableCell colSpan={10} className="p-0">
                                                <div className="pl-12 pr-4 py-4 border-l-4 border-emerald-100 ml-6 my-2 bg-white/50 rounded-r-lg">
                                                    <table className="w-full text-sm">
                                                        <thead>
                                                            <tr className="text-gray-400 text-xs uppercase tracking-wider border-b border-gray-100">
                                                                <th className="text-left py-2 font-medium w-[220px]">
                                                                    {viewMode === 'global' ? 'Category' : 'Tag'}
                                                                </th>
                                                                <th className="text-right py-2 font-medium text-emerald-700">This Month</th>
                                                                <th className="text-right py-2 font-medium text-emerald-700">Limit</th>
                                                                <th className="text-right py-2 font-medium text-emerald-700">Left</th>
                                                                <th className="text-right py-2 font-medium text-gray-600">Monthly Avg</th>
                                                                <th className="text-right py-2 font-medium text-gray-600">Total Spent</th>
                                                                <th className="text-right py-2 font-medium text-gray-600">%</th>
                                                                <th className="text-right py-2 font-medium text-gray-400">Ops</th>
                                                                <th className="text-right py-2 font-medium text-gray-400">Avg. Tkt</th>
                                                                <th className="text-right py-2 font-medium text-gray-400">Forecast</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-50">
                                                            {getBreakdownMetrics(row.category)
                                                                .filter(subItem => {
                                                                    if (!searchQuery) return true;
                                                                    // If the Category itself matched, show all tags?
                                                                    // Or if the tag matches?
                                                                    // Behavior: Show tag if it matches OR if category matches exact (less common).
                                                                    // Better: Show tag if it matches query.
                                                                    // If query matches Category name -> show all tags.
                                                                    const query = searchQuery.toLowerCase();
                                                                    const categoryMatches = row.category.toLowerCase().includes(query);
                                                                    const tagMatches = subItem.name.toLowerCase().includes(query);
                                                                    return categoryMatches || tagMatches;
                                                                })
                                                                .map(subItem => {
                                                                    return (
                                                                        <tr key={subItem.name} className="hover:bg-gray-100/50 transition-colors">
                                                                            <td className="py-2.5 text-gray-600">
                                                                                <div
                                                                                    className="flex items-center gap-2 cursor-pointer hover:text-emerald-600 transition-colors group font-medium w-fit"
                                                                                    onClick={(e) => handleTagClick(e, row.category, subItem.name)}
                                                                                >
                                                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-200 group-hover:bg-emerald-500 transition-colors"></div>
                                                                                    {subItem.name}
                                                                                </div>
                                                                            </td>
                                                                            <td className="text-right py-2.5 text-emerald-700 font-medium bg-emerald-50/10">
                                                                                {formatCurrency(subItem.currentMonthSpent)}
                                                                            </td>
                                                                            <td className="text-right py-2.5 text-gray-300 text-xs bg-emerald-50/10">—</td>
                                                                            <td className="text-right py-2.5 text-gray-300 text-xs bg-emerald-50/10">—</td>
                                                                            <td className="text-right py-2.5 text-gray-600">{formatCurrency(subItem.monthlyAvg)}</td>
                                                                            <td className="text-right py-2.5 text-gray-600">{formatCurrency(subItem.totalSpent)}</td>
                                                                            <td className="text-right py-2.5 text-gray-500">{subItem.share.toFixed(1)}%</td>
                                                                            <td className="text-right py-2.5 text-gray-400 text-xs">{subItem.operations}</td>
                                                                            <td className="text-right py-2.5 text-gray-400 text-xs">{formatCurrency(subItem.avgTransaction)}</td>
                                                                            <td className="text-right py-2.5 text-gray-400 text-xs">
                                                                                {subItem.yearForecast > 0 ? formatCurrency(subItem.yearForecast) : '—'}
                                                                            </td>
                                                                        </tr>
                                                                    )
                                                                })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </React.Fragment>
                            ))}
                        </TableBody>
                    </Table>
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

                <CategoryLimitModal
                    isOpen={!!limitModalData}
                    onClose={() => setLimitModalData(null)}
                    category={limitModalData?.category || ''}
                    currentLimit={limitModalData?.currentLimit}
                    onSave={(amount) => {
                        if (limitModalData?.category) {
                            setLimit(limitModalData.category, amount);
                        }
                    }}
                    onRemove={() => {
                        if (limitModalData?.category) {
                            removeLimit(limitModalData.category);
                        }
                    }}
                />
            </div>
        </div>
    );
};
