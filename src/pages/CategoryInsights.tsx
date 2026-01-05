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
import { ArrowUpDown } from 'lucide-react';
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
    yearForecast: number;
    share: number;
    rank: number;
}

type SortField = keyof CategoryData;
type SortOrder = 'asc' | 'desc';
type ViewMode = 'category' | 'global';

export const CategoryInsights: React.FC<CategoryInsightsProps> = ({ transactions }) => {
    const [sortField, setSortField] = useState<SortField>('totalSpent');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [viewMode, setViewMode] = useState<ViewMode>('category'); // Default to Detailed View

    // Calculate global unique months for consistent averaging
    const uniqueMonthsCount = useMemo(() => {
        const months = new Set<string>();
        const relevantTransactions = transactions.filter(t => t.type === 'expense');
        relevantTransactions.forEach(t => {
            const date = new Date(t.date);
            if (!isNaN(date.getTime())) {
                months.add(`${date.getFullYear()}-${date.getMonth()}`);
            }
        });
        return months.size || 1;
    }, [transactions]);

    const categoryData = useMemo(() => {
        const groups: Record<string, { total: number; count: number }> = {};

        // Filter for expenses ONLY
        const expenseTransactions = transactions.filter(t => t.type === 'expense');

        expenseTransactions.forEach(t => {
            // Determine key based on View Mode
            const key = viewMode === 'global' ? getGlobalCategory(t.category) : t.category;

            if (!groups[key]) {
                groups[key] = { total: 0, count: 0 };
            }
            groups[key].total += Math.abs(t.amount);
            groups[key].count += 1;
        });

        const currentMonth = new Date().getMonth(); // 0-11
        const remainingMonths = 11 - currentMonth;

        const grandTotal = Object.values(groups).reduce((acc, curr) => acc + curr.total, 0);

        return Object.entries(groups).map(([category, { total, count }]) => {
            const totalSpent = total;
            const monthlyAvg = totalSpent / uniqueMonthsCount;
            const yearForecast = monthlyAvg * remainingMonths;
            const share = grandTotal > 0 ? (totalSpent / grandTotal) * 100 : 0;

            return {
                category,
                totalSpent,
                operations: count,
                avgTransaction: count > 0 ? totalSpent / count : 0,
                monthlyAvg,
                yearForecast,
                share,
                // Rank will be assigned after sorting by totalSpent descending
                rank: 0
            };
        })
            .sort((a, b) => b.totalSpent - a.totalSpent) // Initial sort to assign rank
            .map((item, index) => ({ ...item, rank: index + 1 })); // Assign static rank
    }, [transactions, uniqueMonthsCount, viewMode]);




    const sortedData = useMemo(() => {
        return [...categoryData].sort((a, b) => {
            const aValue = a[sortField];
            const bValue = b[sortField];

            if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [categoryData, sortField, sortOrder]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

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

            const year = date.getFullYear();
            const monthKey = `${year}-${date.getMonth()}`;

            monthsMap[monthKey] = (monthsMap[monthKey] || 0) + amount;

            if (year === currentYear) currentYearTotal += amount;
            if (year === lastYear) lastYearTotal += amount;
        });

        const uniqueMonthsCount = Object.keys(monthsMap).length || 1;
        const totalAllTime = Object.values(monthsMap).reduce((a, b) => a + b, 0);
        const avgMonthly = totalAllTime / uniqueMonthsCount;

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

        parentTransactions.forEach(t => {
            // If Global Mode -> Breakdown by Category
            // If Category Mode -> Breakdown by Tag
            const key = viewMode === 'global' ? t.category : (t.tags || 'No Tag');

            if (!groups[key]) {
                groups[key] = { total: 0, count: 0 };
            }
            groups[key].total += Math.abs(t.amount);
            groups[key].count += 1;
        });

        // Current month logic for forecast (same as main)
        const currentMonth = new Date().getMonth();
        const remainingMonths = 11 - currentMonth;

        return Object.entries(groups).map(([key, { total, count }]) => {
            const totalSpent = total;
            const monthlyAvg = totalSpent / uniqueMonthsCount;
            const yearForecast = monthlyAvg * remainingMonths;

            return {
                name: key, // Rename 'tag' to 'name' for generic use
                totalSpent,
                operations: count,
                avgTransaction: count > 0 ? totalSpent / count : 0,
                monthlyAvg,
                yearForecast
            };
        }).sort((a, b) => b.totalSpent - a.totalSpent);
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

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-800">Spending Breakdown</h3>
                        <p className="text-sm text-gray-500">Analyze your spending by {viewMode === 'global' ? 'category group' : 'category'}</p>
                    </div>
                    {/* View Toggle */}
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button
                            onClick={() => {
                                setViewMode('category');
                                setExpandedCategories(new Set()); // Clear expansion
                            }}
                            className={cn(
                                "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                                viewMode === 'category' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                            )}
                        >
                            Detailed Categories
                        </button>
                        <button
                            onClick={() => {
                                setViewMode('global');
                                setExpandedCategories(new Set()); // Clear expansion
                            }}
                            className={cn(
                                "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                                viewMode === 'global' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                            )}
                        >
                            Global Groups
                        </button>
                    </div>
                </div>
                <Table>
                    <TableHeader>
                        <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                            <TableHead className="w-[250px] cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('category')}>
                                <div className="flex items-center gap-1">
                                    {viewMode === 'global' ? 'Global Category' : 'Category'}
                                    {sortField === 'category' && <ArrowUpDown className="w-3 h-3" />}
                                </div>
                            </TableHead>
                            <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('totalSpent')}>
                                <div className="flex items-center justify-end gap-1">
                                    Total Spent
                                    {sortField === 'totalSpent' && <ArrowUpDown className="w-3 h-3" />}
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
                            <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('monthlyAvg')}>
                                <div className="flex items-center justify-end gap-1">
                                    Monthly Avg
                                    {sortField === 'monthlyAvg' && <ArrowUpDown className="w-3 h-3" />}
                                </div>
                            </TableHead>
                            <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('yearForecast')}>
                                <div className="flex items-center justify-end gap-1">
                                    Forecast (Rem. Year)
                                    {sortField === 'yearForecast' && <ArrowUpDown className="w-3 h-3" />}
                                </div>
                            </TableHead>
                            <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('share')}>
                                <div className="flex items-center justify-end gap-1">
                                    % Share
                                    {sortField === 'share' && <ArrowUpDown className="w-3 h-3" />}
                                </div>
                            </TableHead>
                            <TableHead className="text-right w-16 cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('rank')}>
                                <div className="flex items-center justify-end gap-1">
                                    Rank
                                    {sortField === 'rank' && <ArrowUpDown className="w-3 h-3" />}
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
                                                {expandedCategories.has(row.category) ? '▼' : '▶'}
                                            </span>
                                            {(() => {
                                                const color = stringToColor(row.category);
                                                // Icon resolution:
                                                // If Global Mode: use generic icon or try to map
                                                // We can rely on getCategoryIcon("Housing") etc if they exist, or fallback
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
                                    <TableCell className="text-right relative">
                                        <div className="relative z-10 font-medium text-gray-900">
                                            {formatCurrency(row.totalSpent)}
                                        </div>
                                        {/* Progress Bar Background */}
                                        <div
                                            className="absolute left-0 top-2 bottom-2 rounded-r-md transition-all duration-500"
                                            style={{
                                                width: `${(row.totalSpent / maxTotalSpent) * 100}%`,
                                                opacity: 0.25,
                                                backgroundColor: (() => {
                                                    const ratio = row.totalSpent / maxTotalSpent;
                                                    const hue = (1 - ratio) * 120;
                                                    return `hsl(${hue}, 70%, 50%)`;
                                                })()
                                            }}
                                        />
                                    </TableCell>
                                    <TableCell className="text-right text-gray-500">{row.operations}</TableCell>
                                    <TableCell className="text-right text-gray-500">{formatCurrency(row.avgTransaction)}</TableCell>
                                    <TableCell className="text-right text-gray-500">{formatCurrency(row.monthlyAvg)}</TableCell>
                                    <TableCell className="text-right text-gray-400">
                                        {row.yearForecast > 0 ? formatCurrency(row.yearForecast) : '—'}
                                    </TableCell>
                                    <TableCell className="text-right text-gray-500 font-medium">{row.share.toFixed(1)}%</TableCell>
                                    <TableCell className="text-right text-gray-400 font-mono text-xs">#{row.rank}</TableCell>
                                </TableRow>

                                {/* Expanded Tag View */}
                                {expandedCategories.has(row.category) && (
                                    <TableRow className="bg-gray-50/50">
                                        <TableCell colSpan={8} className="p-0">
                                            <div className="pl-12 pr-4 py-4 border-l-4 border-emerald-100 ml-6 my-2 bg-white/50 rounded-r-lg">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="text-gray-400 text-xs uppercase tracking-wider border-b border-gray-100">
                                                            <th className="text-left py-2 font-medium">
                                                                {viewMode === 'global' ? 'Category' : 'Tag (Subcategory)'}
                                                            </th>
                                                            <th className="text-right py-2 font-medium">Total Spent</th>
                                                            <th className="text-right py-2 font-medium">Ops</th>
                                                            <th className="text-right py-2 font-medium">Avg. Ticket</th>
                                                            <th className="text-right py-2 font-medium">Monthly Avg</th>
                                                            <th className="text-right py-2 font-medium">Forecast</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50">
                                                        {getBreakdownMetrics(row.category).map(subItem => (
                                                            <tr key={subItem.name} className="hover:bg-gray-100/50 transition-colors">
                                                                <td className="py-2.5 text-gray-600">
                                                                    {viewMode === 'category' ? (
                                                                        // Tag Mode: Clickable for Modal
                                                                        <div
                                                                            className="flex items-center gap-2 cursor-pointer hover:text-emerald-600 transition-colors group font-medium w-fit"
                                                                            onClick={(e) => handleTagClick(e, row.category, subItem.name)}
                                                                        >
                                                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-200 group-hover:bg-emerald-500 transition-colors"></div>
                                                                            {subItem.name}
                                                                        </div>
                                                                    ) : (
                                                                        // Global Mode: Just list categories (Not drill-down to tag transactions yet, 
                                                                        // or we could make this drill down to specific category transactions? 
                                                                        // For now, let's just make it static text or maybe trigger modal with NO tag filter?
                                                                        // User didn't explicitly ask for 3-level drill down, just grouping.
                                                                        // Let's keep it simple: List of categories.
                                                                        <div className="flex items-center gap-2 font-medium">
                                                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-200"></div>
                                                                            {subItem.name}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className="text-right py-2.5 text-gray-700">{formatCurrency(subItem.totalSpent)}</td>
                                                                <td className="text-right py-2.5 text-gray-500">{subItem.operations}</td>
                                                                <td className="text-right py-2.5 text-gray-500">{formatCurrency(subItem.avgTransaction)}</td>
                                                                <td className="text-right py-2.5 text-gray-500">{formatCurrency(subItem.monthlyAvg)}</td>
                                                                <td className="text-right py-2.5 text-gray-400">{subItem.yearForecast > 0 ? formatCurrency(subItem.yearForecast) : '—'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                                {getBreakdownMetrics(row.category).length === 0 && (
                                                    <div className="text-center py-4 text-gray-400 text-xs italic">
                                                        No data found
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
