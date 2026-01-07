import React, { useMemo } from 'react';
import { cn } from '../lib/utils';
import type { Transaction } from '../types';
import { Calendar } from 'lucide-react';
import { useState } from 'react';
import { TransactionListModal } from './TransactionListModal';

interface SpendingHeatmapProps {
    transactions: Transaction[];
}

export const SpendingHeatmap: React.FC<SpendingHeatmapProps> = ({ transactions }) => {
    const [selectedDayList, setSelectedDayList] = useState<{ date: Date; transactions: Transaction[] } | null>(null);
    // const [tooltipData, setTooltipData] = useState<{ date: string; amount: number; count: number; x: number; y: number } | null>(null);

    // 1. Prepare Data
    // We want to show the last 365 days (approx 52 weeks)
    // Structure: Array of Weeks, where each Week has 7 Days (Sun-Sat or Mon-Sun)
    // Let's stick to GitHub style: Columns are weeks, Rows are days (Sun-Sat).

    const calendarData = useMemo(() => {
        const today = new Date();
        const endDate = today;
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - 365); // Go back 1 year

        // Adjust startDate to the previous Sunday to align grid cleanly
        const dayOfWeek = startDate.getDay(); // 0 = Sun
        startDate.setDate(startDate.getDate() - dayOfWeek);

        // Generate Map of Date -> Spend
        const dailySpend = new Map<string, { amount: number; count: number; transactions: Transaction[] }>();
        let maxSpend = 0;

        transactions.forEach(t => {
            if (t.type !== 'expense') return; // Only expenses

            const date = new Date(t.date);
            // Sanity check date
            if (isNaN(date.getTime())) return;

            // Format YYYY-MM-DD for key
            const key = date.toISOString().split('T')[0];

            if (!dailySpend.has(key)) {
                dailySpend.set(key, { amount: 0, count: 0, transactions: [] });
            }

            const entry = dailySpend.get(key)!;
            entry.amount += Math.abs(t.amount);
            entry.count += 1;
            entry.transactions.push(t);

            if (entry.amount > maxSpend) maxSpend = entry.amount;
        });

        // Determine Intensity Tiers
        // Use a non-linear scale (Square Root) to better differentiate lower spending from massive outliers.
        // If we use linear, one huge rent payment makes everything else look like zero.
        const maxSqrt = Math.sqrt(maxSpend);

        const getIntensity = (amount: number) => {
            if (amount === 0) return 0;
            if (maxSpend === 0) return 0;

            const valSqrt = Math.sqrt(amount);
            const ratio = valSqrt / maxSqrt;

            if (ratio < 0.25) return 1; // Small
            if (ratio < 0.50) return 2; // Medium-Low
            if (ratio < 0.75) return 3; // Medium-High
            return 4; // High
        };

        // Calculate Tier Stats
        const stats = {
            0: { count: 0, min: Infinity, max: -Infinity, total: 0 },
            1: { count: 0, min: Infinity, max: -Infinity, total: 0 },
            2: { count: 0, min: Infinity, max: -Infinity, total: 0 },
            3: { count: 0, min: Infinity, max: -Infinity, total: 0 },
            4: { count: 0, min: Infinity, max: -Infinity, total: 0 },
        };

        // Build Grid
        const weeks: Array<{ days: Array<{ date: Date; dateStr: string; amount: number; count: number; intensity: number; transactions: Transaction[] } | null> }> = [];
        let currentWeek: Array<{ date: Date; dateStr: string; amount: number; count: number; intensity: number; transactions: Transaction[] } | null> = [];

        // Loop from startDate to endDate
        const iterDate = new Date(startDate);

        // Safety break to prevent infinite loops locally
        let safeguard = 0;
        let minSpend = Infinity;
        let totalSpend = 0;

        while (iterDate <= endDate || currentWeek.length > 0) { // Continue until we finish the last partial week
            safeguard++;
            if (safeguard > 1000) break;

            const isoDate = iterDate.toISOString().split('T')[0];
            const data = dailySpend.get(isoDate);
            const amount = data ? data.amount : 0;
            const count = data ? data.count : 0;
            const dayTransactions = data ? data.transactions : [];

            // Only add if we haven't passed endDate by a full week essentially,
            // but simplified: we just pile into weeks.
            // Actually, better condition:
            if (iterDate > endDate && currentWeek.length === 0) break;

            if (amount > 0) {
                minSpend = Math.min(minSpend, amount);
                totalSpend += amount;
            }

            const intensity = getIntensity(amount);

            // Update Stats
            stats[intensity as keyof typeof stats].count++;
            stats[intensity as keyof typeof stats].total += amount;
            if (amount > 0) {
                // Only track min/max for non-zero amounts for tiers > 0
                // But for tier 0 min/max are 0.
                stats[intensity as keyof typeof stats].min = Math.min(stats[intensity as keyof typeof stats].min, amount);
                stats[intensity as keyof typeof stats].max = Math.max(stats[intensity as keyof typeof stats].max, amount);
            } else if (intensity === 0) { // For tier 0, min/max are 0
                stats[intensity as keyof typeof stats].min = 0;
                stats[intensity as keyof typeof stats].max = 0;
            }

            const dayData = {
                date: new Date(iterDate),
                dateStr: isoDate,
                amount,
                count,
                intensity,
                transactions: dayTransactions
            };

            currentWeek.push(dayData);

            if (currentWeek.length === 7) {
                weeks.push({ days: currentWeek });
                currentWeek = [];
            }

            // Next day
            iterDate.setDate(iterDate.getDate() + 1);
        }

        return { weeks, maxSpend, stats, minSpend: minSpend === Infinity ? 0 : minSpend, totalSpend };
    }, [transactions]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            maximumFractionDigits: 0
        }).format(val);
    };

    const formatCompact = (val: number) => {
        if (val >= 1000000) return (val / 1000000).toFixed(0) + 'M';
        if (val >= 1000) return (val / 1000).toFixed(0) + 'k';
        return Math.round(val).toString();
    };

    // Quick Month Labels
    const monthLabels = useMemo(() => {
        const labels: { text: string; index: number }[] = [];
        let lastMonth = -1;

        calendarData.weeks.forEach((week, index) => {
            const firstDay = week.days[0];
            if (firstDay && firstDay.date.getMonth() !== lastMonth) {
                labels.push({
                    text: firstDay.date.toLocaleString('default', { month: 'short' }),
                    index
                });
                lastMonth = firstDay.date.getMonth();
            }
        });
        return labels;
    }, [calendarData]);

    const spendingDays = calendarData.stats[1].count + calendarData.stats[2].count + calendarData.stats[3].count + calendarData.stats[4].count;
    const avgDailySpend = spendingDays > 0 ? calendarData.totalSpend / spendingDays : 0;

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm w-full overflow-hidden">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-gray-500" />
                        Spending Activity
                    </h3>
                    <p className="text-sm text-gray-500">Daily spending intensity over the last year</p>
                </div>
            </div>

            <div className="overflow-x-auto pb-6">
                <div className="min-w-[700px] w-full">
                    {/* Month Labels */}
                    <div className="flex mb-2 text-xs text-gray-400 h-4 relative">
                        {monthLabels.map((label, i) => (
                            <div
                                key={i}
                                style={{
                                    position: 'absolute',
                                    left: `${(label.index / calendarData.weeks.length) * 100}%`
                                }}
                            >
                                {label.text}
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-[3px] w-full">
                        {calendarData.weeks.map((week, wIndex) => (
                            <div key={wIndex} className="flex flex-col gap-[3px] flex-1">
                                {week.days.map((day, dIndex) => (
                                    <div
                                        key={dIndex}
                                        className={cn(
                                            "w-full aspect-square rounded-[2px] transition-colors relative group",
                                            day ? (
                                                day.intensity === 0 ? "bg-gray-50 hover:bg-gray-100" :
                                                    day.intensity === 1 ? "bg-emerald-100 hover:bg-emerald-200" : // Tiny
                                                        day.intensity === 2 ? "bg-emerald-300 hover:bg-emerald-400" : // Small
                                                            day.intensity === 3 ? "bg-emerald-500 hover:bg-emerald-600" : // Medium
                                                                "bg-emerald-900 hover:bg-gray-900" // High
                                            ) : "bg-transparent",
                                            day ? "cursor-pointer" : ""
                                        )}
                                        onClick={() => {
                                            if (day) {
                                                setSelectedDayList({ date: day.date, transactions: day.transactions });
                                            }
                                        }}
                                        title={day ? `${day.date.toDateString()}: ${formatCurrency(day.amount)}` : ''}
                                    >
                                        {/* Smart CSS Tooltip */}
                                        {day && (
                                            <div className={cn(
                                                "hidden group-hover:block absolute z-50 pointer-events-none whitespace-nowrap",
                                                // Vertical positioning: Top rows -> show below, Others -> show above
                                                dIndex < 2 ? "top-full mt-2" : "bottom-full mb-2",
                                                // Horizontal positioning:
                                                wIndex < 4 ? "left-0" :
                                                    wIndex > calendarData.weeks.length - 5 ? "right-0" :
                                                        "left-1/2 -translate-x-1/2"
                                            )}>
                                                <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 shadow-lg border border-gray-700">
                                                    <div className="font-semibold">{day.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                                                    <div>{day.amount > 0 ? formatCurrency(day.amount) : 'No spending'}</div>
                                                    {day.amount > 0 && <div className="text-gray-400 text-[10px]">{day.count} transaction{day.count !== 1 ? 's' : ''}</div>}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Unified Footer */}
            <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
                {/* Summary Stats */}
                <div className="flex gap-6 text-xs text-gray-500">
                    <div>
                        <span className="font-bold text-gray-900 block text-lg">
                            {spendingDays}
                        </span>
                        spending days
                    </div>
                    <div>
                        <span className="font-bold text-gray-900 block text-lg">{formatCurrency(avgDailySpend)}</span>
                        avg daily spend
                    </div>
                    <div>
                        <span className="font-bold text-gray-900 block text-lg">{formatCurrency(calendarData.minSpend)}</span>
                        lowest daily spend
                    </div>
                    <div>
                        <span className="font-bold text-gray-900 block text-lg">{formatCurrency(calendarData.maxSpend)}</span>
                        highest daily spend
                    </div>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4">
                    {[0, 1, 2, 3, 4].map((tier) => {
                        const s = calendarData.stats[tier as keyof typeof calendarData.stats];

                        // Hide empty tiers
                        if (s.count === 0) return null;

                        const bgClass = tier === 0 ? "bg-gray-50" :
                            tier === 1 ? "bg-emerald-100" :
                                tier === 2 ? "bg-emerald-300" :
                                    tier === 3 ? "bg-emerald-500" :
                                        "bg-emerald-900";

                        const label = tier === 0 ? "No Spend" :
                            (s.min !== Infinity && s.max !== -Infinity ? `${formatCompact(s.min)} - ${formatCompact(s.max)}` : "—");

                        return (
                            <div key={tier} className="flex items-center gap-2">
                                <div className={cn("w-3 h-3 rounded-sm flex-shrink-0", bgClass)} />
                                <div className="flex flex-col leading-tight">
                                    <span className="text-[10px] font-semibold text-gray-700">
                                        {label}
                                    </span>
                                    <span className="text-[9px] text-gray-400">
                                        {s.count} days
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>


            {
                selectedDayList && (
                    <TransactionListModal
                        isOpen={true}
                        onClose={() => setSelectedDayList(null)}
                        title={selectedDayList.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                        subtitle="Daily Spending"
                        transactions={selectedDayList.transactions}
                    />
                )
            }
        </div >
    );
}
