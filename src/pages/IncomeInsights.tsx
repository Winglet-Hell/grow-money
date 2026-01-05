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

interface IncomeInsightsProps {
    transactions: Transaction[];
}

interface CategoryData {
    category: string;
    totalEarned: number;
    operations: number;
    avgTransaction: number;
    monthlyAvg: number;
    yearForecast: number;
}

type SortField = keyof CategoryData;
type SortOrder = 'asc' | 'desc';

export const IncomeInsights: React.FC<IncomeInsightsProps> = ({ transactions }) => {
    const [sortField, setSortField] = useState<SortField>('totalEarned');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

    const categoryData = useMemo(() => {
        const groups: Record<string, { total: number; count: number }> = {};
        const months = new Set<string>();

        // Filter for income ONLY
        const incomeTransactions = transactions.filter(t => t.type === 'income');

        incomeTransactions.forEach(t => {
            if (!groups[t.category]) {
                groups[t.category] = { total: 0, count: 0 };
            }

            // For income, amounts are usually positive in csv/excel or handled by parser.
            // We use Math.abs just in case to ensure magnitude.
            groups[t.category].total += Math.abs(t.amount);
            groups[t.category].count += 1;

            const date = new Date(t.date);
            if (!isNaN(date.getTime())) {
                // Use date for month counting
                const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
                months.add(monthKey);
            }
        });

        const uniqueMonths = months.size || 1; // Avoid division by zero
        const currentMonth = new Date().getMonth(); // 0-11
        const remainingMonths = 11 - currentMonth;

        return Object.entries(groups).map(([category, { total, count }]) => {
            const totalEarned = total;
            const monthlyAvg = totalEarned / uniqueMonths;
            const yearForecast = monthlyAvg * remainingMonths;

            return {
                category,
                totalEarned,
                operations: count,
                avgTransaction: count > 0 ? totalEarned / count : 0,
                monthlyAvg,
                yearForecast
            };
        });
    }, [transactions]);

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

    const handleTagClick = (category: string, tag: string) => {
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
                months.add(`${date.getFullYear()}-${date.getMonth()}`);
            }
        });
        return months.size || 1;
    }, [transactions]);

    // Helper to get tag metrics for a specific category (Income version)
    const getTagMetrics = (category: string) => {
        const categoryTransactions = transactions.filter(
            t => t.type === 'income' && t.category === category
        );

        const groups: Record<string, { total: number; count: number }> = {};

        categoryTransactions.forEach(t => {
            const tag = t.tags || 'No Tag';
            if (!groups[tag]) {
                groups[tag] = { total: 0, count: 0 };
            }
            groups[tag].total += Math.abs(t.amount);
            groups[tag].count += 1;
        });

        const currentMonth = new Date().getMonth();
        const remainingMonths = 11 - currentMonth;

        return Object.entries(groups).map(([tag, { total, count }]) => {
            const totalEarned = total;
            const monthlyAvg = totalEarned / uniqueMonthsCount;
            const yearForecast = monthlyAvg * remainingMonths;

            return {
                tag,
                totalEarned,
                operations: count,
                avgTransaction: count > 0 ? totalEarned / count : 0,
                monthlyAvg,
                yearForecast
            };
        }).sort((a, b) => b.totalEarned - a.totalEarned);
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

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                <div className="p-6 border-b border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-800">Income Breakdown</h3>
                    <p className="text-sm text-gray-500">Analyze your income sources by category</p>
                </div>
                <Table>
                    <TableHeader>
                        <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                            <TableHead className="w-[250px] cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('category')}>
                                <div className="flex items-center gap-1">
                                    Category
                                    {sortField === 'category' && <ArrowUpDown className="w-3 h-3" />}
                                </div>
                            </TableHead>
                            <TableHead className="text-right cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('totalEarned')}>
                                <div className="flex items-center justify-end gap-1">
                                    Total Earned
                                    {sortField === 'totalEarned' && <ArrowUpDown className="w-3 h-3" />}
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
                                            {formatCurrency(row.totalEarned)}
                                        </div>
                                        {/* Progress Bar Background */}
                                        <div
                                            className="absolute left-0 top-2 bottom-2 rounded-r-md transition-all duration-500"
                                            style={{
                                                width: `${(row.totalEarned / maxTotalEarned) * 100}%`,
                                                opacity: 0.25,
                                                backgroundColor: (() => {
                                                    const ratio = row.totalEarned / maxTotalEarned;
                                                    const hue = ratio * 120;
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
                                </TableRow>

                                {/* Expanded Tag View */}
                                {expandedCategories.has(row.category) && (
                                    <TableRow className="bg-gray-50/50">
                                        <TableCell colSpan={6} className="p-0">
                                            <div className="pl-12 pr-4 py-4 border-l-4 border-emerald-100 ml-6 my-2 bg-white/50 rounded-r-lg">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="text-gray-400 text-xs uppercase tracking-wider border-b border-gray-100">
                                                            <th className="text-left py-2 font-medium">Tag (Subcategory)</th>
                                                            <th className="text-right py-2 font-medium">Total Earned</th>
                                                            <th className="text-right py-2 font-medium">Ops</th>
                                                            <th className="text-right py-2 font-medium">Avg. Ticket</th>
                                                            <th className="text-right py-2 font-medium">Monthly Avg</th>
                                                            <th className="text-right py-2 font-medium">Forecast</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50">
                                                        {getTagMetrics(row.category).map(tagRow => (
                                                            <tr key={tagRow.tag} className="hover:bg-gray-100/50 transition-colors">
                                                                <td className="py-2.5 text-gray-600">
                                                                    <div
                                                                        className="flex items-center gap-2 cursor-pointer hover:text-emerald-600 transition-colors group font-medium w-fit"
                                                                        onClick={() => handleTagClick(row.category, tagRow.tag)}
                                                                    >
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-200 group-hover:bg-emerald-500 transition-colors"></div>
                                                                        {tagRow.tag}
                                                                    </div>
                                                                </td>
                                                                <td className="text-right py-2.5 text-gray-700">{formatCurrency(tagRow.totalEarned)}</td>
                                                                <td className="text-right py-2.5 text-gray-500">{tagRow.operations}</td>
                                                                <td className="text-right py-2.5 text-gray-500">{formatCurrency(tagRow.avgTransaction)}</td>
                                                                <td className="text-right py-2.5 text-gray-500">{formatCurrency(tagRow.monthlyAvg)}</td>
                                                                <td className="text-right py-2.5 text-gray-400">{tagRow.yearForecast > 0 ? formatCurrency(tagRow.yearForecast) : '—'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                                {getTagMetrics(row.category).length === 0 && (
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
