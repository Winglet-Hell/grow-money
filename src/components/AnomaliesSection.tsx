import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';
import { getCategoryIcon } from '../lib/categoryIcons';
import { cn, stringToColor } from '../lib/utils';
import type { Transaction } from '../types';

interface AnomaliesSectionProps {
    transactions: Transaction[];
}

export function AnomaliesSection({ transactions }: AnomaliesSectionProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    // Calculate anomalies based on "Last Closed Month" vs "Average of Previous Closed Months"
    const anomalies = useMemo(() => {
        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // 1. Group by Category -> Month -> Amount
        const categoryMonthlyData: Record<string, Record<string, number>> = {};
        const allCategories = new Set<string>();

        transactions.forEach(t => {
            if (t.type !== 'expense') return; // Focus on EXPENSES for anomalies usually, or user wants both? "My spending" implies expenses. Let's do Expenses for now as it's most critical.

            const dDate = new Date(t.date);
            const key = `${dDate.getFullYear()}-${String(dDate.getMonth() + 1).padStart(2, '0')}`;

            if (key >= currentMonthKey) return; // Exclude current incomplete month entirely from calculation

            if (!categoryMonthlyData[t.category]) {
                categoryMonthlyData[t.category] = {};
            }
            if (!categoryMonthlyData[t.category][key]) {
                categoryMonthlyData[t.category][key] = 0;
            }
            categoryMonthlyData[t.category][key] += Math.abs(t.amount);
            allCategories.add(t.category);
        });

        // 2. Identify "Last Closed Month"
        // Find the global last closed month available in data to ensure we compare the same period for all?
        // Actually, for each category, we want to compare its latest activity.
        // But usually "Anomalies" implies "What happened LAST month that was weird?".

        // Let's determine the "Last Closed Month" relative to NOW.
        // i.e., If now is Jan 2026, Last Closed is Dec 2025.
        // We only care about anomalies in Dec 2025.
        const lastClosedDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastClosedKey = `${lastClosedDate.getFullYear()}-${String(lastClosedDate.getMonth() + 1).padStart(2, '0')}`;

        const results: {
            category: string;
            lastClosedAmount: number;
            avgPrevious: number;
            diffAbs: number;
            diffPercent: number;
        }[] = [];

        allCategories.forEach(cat => {
            const monthsData = categoryMonthlyData[cat];
            const sortedMonths = Object.keys(monthsData).sort();

            // Check if this category has data for Last Closed Month
            const lastAmount = monthsData[lastClosedKey] || 0;

            // Calculate Average of "Previous" months (excluding Last Closed Month)
            const previousMonths = sortedMonths.filter(m => m < lastClosedKey);

            if (previousMonths.length === 0) {
                // New category started this month? Comparison hard. Skip or special case.
                // If vast spending, maybe interesting.
                if (lastAmount > 0) {
                    results.push({
                        category: cat,
                        lastClosedAmount: lastAmount,
                        avgPrevious: 0,
                        diffAbs: lastAmount,
                        diffPercent: 100
                    });
                }
                return;
            }

            const totalPrev = previousMonths.reduce((sum, m) => sum + monthsData[m], 0);
            const avg = totalPrev / previousMonths.length;

            if (avg === 0 && lastAmount === 0) return;

            const diff = lastAmount - avg;
            const percent = avg > 0 ? (diff / avg) * 100 : 100;

            // Filter out trivial amounts (e.g. 10 rub vs 5 rub)
            // if (Math.abs(diff) < 1000) return; 

            results.push({
                category: cat,
                lastClosedAmount: lastAmount,
                avgPrevious: avg,
                diffAbs: diff,
                diffPercent: percent
            });
        });

        // 3. Sort by Absolute Deviation (Biggest Impact)
        return results.sort((a, b) => Math.abs(b.diffAbs) - Math.abs(a.diffAbs));
    }, [transactions]);

    const formatMoney = (val: number) => {
        // Short format: 1.5k, 20k
        if (Math.abs(val) >= 1000) return (val / 1000).toFixed(0) + 'k';
        return Math.round(val).toString();
    };

    if (anomalies.length === 0) return null;

    const monthName = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
        .toLocaleString('en-US', { month: 'long', year: 'numeric' });

    return (
        <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2">
                Category Spending Deviations
                <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">
                    {monthName}
                </span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {(isExpanded ? anomalies : anomalies.slice(0, 5)).map(item => {
                    const Icon = getCategoryIcon(item.category);
                    const color = stringToColor(item.category);
                    const isBad = item.diffAbs > 0; // Spending increased

                    return (
                        <div key={item.category} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-start justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <div className={cn(
                                        "p-1.5 rounded-md",
                                        color.bg,
                                        color.text
                                    )}>
                                        <Icon className="w-4 h-4" />
                                    </div>
                                    <span className="font-medium text-gray-900 text-sm truncate max-w-[100px]" title={item.category}>{item.category}</span>
                                </div>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-bold text-gray-900">{formatMoney(item.lastClosedAmount)}</span>
                                    <span className="text-xs text-gray-400">avg {formatMoney(item.avgPrevious)}</span>
                                </div>
                            </div>

                            <div className={cn(
                                "flex items-center gap-0.5 text-xs font-semibold px-2 py-1 rounded-full",
                                isBad ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                            )}>
                                {isBad ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                <span>{isBad ? '+' : ''}{formatMoney(item.diffAbs)}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {anomalies.length > 5 && (
                <div className="mt-6 flex justify-center">
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="flex items-center gap-2 px-6 py-2 rounded-full bg-white border border-gray-100 shadow-sm text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all active:scale-95"
                    >
                        {isExpanded ? (
                            <>
                                Show Less
                                <ChevronUp className="w-4 h-4" />
                            </>
                        ) : (
                            <>
                                Show More ({anomalies.length - 5} more)
                                <ChevronDown className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
