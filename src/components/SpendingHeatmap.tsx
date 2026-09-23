import React, { useMemo } from 'react';
import { cn } from '../lib/utils';
import type { Transaction } from '../types';
import { Calendar } from 'lucide-react';
import { useState } from 'react';
import { TransactionListModal } from './TransactionListModal';
import { usePrivacy } from '../contexts/PrivacyContext';
import { isPlannedPayment } from '../lib/categoryGroups';

interface SpendingHeatmapProps {
    transactions: Transaction[];
}

// The viewer's calendar date as "YYYY-MM-DD". The grid walks local days; toISOString() gives
// the UTC date instead, which runs a day behind after midnight east of Greenwich (until 03:00
// in Moscow) and shifted every cell onto the previous day's spending.
const localDateKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Colour per tier, shared by the cells and the legend: 0 = no spending, 1–5 = ever larger days.
const TIER_BG = ['bg-gray-50', 'bg-emerald-100', 'bg-emerald-300', 'bg-emerald-500', 'bg-emerald-700', 'bg-emerald-900'];
const TIER_HOVER = ['hover:bg-gray-100', 'hover:bg-emerald-200', 'hover:bg-emerald-400', 'hover:bg-emerald-600', 'hover:bg-emerald-800', 'hover:bg-gray-900'];

// "Everyday only" is a per-device convenience; falls back to all spending when storage is unavailable.
const EVERYDAY_KEY = 'heatmapEverydayOnly';
const readEverydayOnly = (): boolean => {
    try {
        return localStorage.getItem(EVERYDAY_KEY) === '1';
    } catch {
        return false;
    }
};
const storeEverydayOnly = (on: boolean) => {
    try { localStorage.setItem(EVERYDAY_KEY, on ? '1' : '0'); } catch { /* private mode etc. */ }
};

export const SpendingHeatmap: React.FC<SpendingHeatmapProps> = ({ transactions }) => {
    const { isPrivacyMode } = usePrivacy();
    const [selectedDayList, setSelectedDayList] = useState<{ date: Date; transactions: Transaction[] } | null>(null);
    // const [tooltipData, setTooltipData] = useState<{ date: string; amount: number; count: number; x: number; y: number } | null>(null);
    // Everyday spending only: leaves out rent, flights and hotels, tech, visas and insurance.
    const [everydayOnly, setEverydayOnly] = useState(readEverydayOnly);
    const chooseEverydayOnly = (on: boolean) => {
        setEverydayOnly(on);
        storeEverydayOnly(on);
    };

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

        transactions.forEach(t => {
            if (t.type !== 'expense') return; // Only expenses
            if (everydayOnly && isPlannedPayment(t.category)) return;

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
        });

        // Intensity tiers come from the year's own spending days, the way GitHub shades its
        // grid: tiers 1–3 hold a quarter of them each, tier 4 the next 20% and tier 5 the
        // biggest 5% — rent, flights, a new laptop. Scaled against the single biggest day
        // instead, nine days in ten shared the palest shade.
        const startKey = localDateKey(startDate);
        const endKey = localDateKey(endDate);
        const yearAmounts = Array.from(dailySpend.entries())
            .filter(([key, day]) => key >= startKey && key <= endKey && day.amount > 0)
            .map(([, day]) => day.amount)
            .sort((a, b) => a - b);
        const quantile = (p: number) => yearAmounts[Math.min(yearAmounts.length - 1, Math.floor(p * yearAmounts.length))];
        const thresholds = yearAmounts.length > 0 ? [0.25, 0.5, 0.75, 0.95].map(quantile) : [];

        const getIntensity = (amount: number) =>
            amount > 0 ? 1 + thresholds.filter(threshold => amount > threshold).length : 0;

        // Calculate Tier Stats (indexed by tier)
        const stats = TIER_BG.map(() => ({ count: 0, min: Infinity, max: -Infinity, total: 0 }));

        // Build Grid
        const weeks: Array<{ days: Array<{ date: Date; dateStr: string; amount: number; count: number; intensity: number; transactions: Transaction[] } | null> }> = [];
        let currentWeek: Array<{ date: Date; dateStr: string; amount: number; count: number; intensity: number; transactions: Transaction[] } | null> = [];

        // Loop from startDate to endDate
        const iterDate = new Date(startDate);

        // Safety break to prevent infinite loops locally
        let safeguard = 0;
        let minSpend = Infinity;
        let maxSpend = 0;
        let totalSpend = 0;

        while (iterDate <= endDate || currentWeek.length > 0) { // Continue until we finish the last partial week
            safeguard++;
            if (safeguard > 1000) break;

            const isoDate = localDateKey(iterDate);
            const data = dailySpend.get(isoDate);
            const amount = data ? data.amount : 0;
            const count = data ? data.count : 0;
            const dayTransactions = data ? data.transactions : [];

            // Only add if we haven't passed endDate by a full week essentially,
            // but simplified: we just pile into weeks.
            // Actually, better condition:
            if (iterDate > endDate && currentWeek.length === 0) break;

            if (iterDate > endDate) {
                // Days after today only pad out the last week: left blank and out of the stats,
                // since a day that hasn't happened yet isn't a day without spending.
                currentWeek.push(null);
            } else {
                if (amount > 0) {
                    minSpend = Math.min(minSpend, amount);
                    maxSpend = Math.max(maxSpend, amount);
                    totalSpend += amount;
                }

                const intensity = getIntensity(amount);

                // Update Stats
                stats[intensity].count++;
                stats[intensity].total += amount;
                if (amount > 0) {
                    // Only track min/max for non-zero amounts for tiers > 0
                    // But for tier 0 min/max are 0.
                    stats[intensity].min = Math.min(stats[intensity].min, amount);
                    stats[intensity].max = Math.max(stats[intensity].max, amount);
                } else if (intensity === 0) { // For tier 0, min/max are 0
                    stats[intensity].min = 0;
                    stats[intensity].max = 0;
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
            }

            if (currentWeek.length === 7) {
                weeks.push({ days: currentWeek });
                currentWeek = [];
            }

            // Next day
            iterDate.setDate(iterDate.getDate() + 1);
        }

        return { weeks, maxSpend, stats, minSpend: minSpend === Infinity ? 0 : minSpend, totalSpend };
    }, [transactions, everydayOnly]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            maximumFractionDigits: 0
        }).format(val);
    };

    // "1.2k" below ten thousand: the legend's lower tiers sit a few hundred roubles apart.
    const formatCompact = (val: number) => {
        if (val >= 1000000) return (val / 1000000).toFixed(0) + 'M';
        if (val >= 10000) return (val / 1000).toFixed(0) + 'k';
        if (val >= 1000) return (val / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
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

    const spendingDays = calendarData.stats.slice(1).reduce((sum, tier) => sum + tier.count, 0);
    const avgDailySpend = spendingDays > 0 ? calendarData.totalSpend / spendingDays : 0;

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm w-full overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-gray-500" />
                        Spending Activity
                    </h3>
                    <p className="text-sm text-gray-500">
                        {everydayOnly
                            ? 'Everyday spending over the last year, without rent, flights & hotels, tech, visas and insurance'
                            : 'Daily spending intensity over the last year'}
                    </p>
                </div>

                {/* All spending vs everyday only */}
                <div className="flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto flex-shrink-0">
                    <button
                        onClick={() => chooseEverydayOnly(false)}
                        className={cn(
                            "flex-1 sm:flex-none px-3 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap",
                            !everydayOnly ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                        )}
                    >
                        All spending
                    </button>
                    <button
                        onClick={() => chooseEverydayOnly(true)}
                        className={cn(
                            "flex-1 sm:flex-none px-3 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap",
                            everydayOnly ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                        )}
                    >
                        Everyday
                    </button>
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
                                            day ? cn(TIER_BG[day.intensity], TIER_HOVER[day.intensity]) : "bg-transparent",
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
                                                <div className="bg-white/95 backdrop-blur-sm p-3 rounded-xl shadow-xl border border-gray-100 flex flex-col gap-2 min-w-[140px]">
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-1.5 mb-0.5">
                                                        {day.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                                    </p>
                                                    <div className="flex flex-col gap-1.5">
                                                        <div className="flex items-center justify-between gap-4">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full ring-2 ring-white bg-emerald-500" />
                                                                <span className="text-xs font-medium text-gray-500">Expenses</span>
                                                            </div>
                                                            <span className="text-xs font-bold text-gray-900">
                                                                {isPrivacyMode ? '••••••' : (day.amount > 0 ? formatCurrency(day.amount) : 'No spend')}
                                                            </span>
                                                        </div>
                                                        {day.amount > 0 && (
                                                            <div className="flex items-center justify-between gap-4">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-2 h-2" /> {/* alignment spacer */}
                                                                    <span className="text-[10px] text-gray-400">Transactions</span>
                                                                </div>
                                                                <span className="text-[10px] font-medium text-gray-500">{day.count}</span>
                                                            </div>
                                                        )}
                                                    </div>
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
                        <span className="font-bold text-gray-900 block text-lg">{isPrivacyMode ? '••••••' : formatCurrency(avgDailySpend)}</span>
                        avg daily spend
                    </div>
                    <div>
                        <span className="font-bold text-gray-900 block text-lg">{isPrivacyMode ? '••••••' : formatCurrency(calendarData.minSpend)}</span>
                        lowest daily spend
                    </div>
                    <div>
                        <span className="font-bold text-gray-900 block text-lg">{isPrivacyMode ? '••••••' : formatCurrency(calendarData.maxSpend)}</span>
                        highest daily spend
                    </div>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4">
                    {calendarData.stats.map((s, tier) => {
                        // Hide empty tiers
                        if (s.count === 0) return null;

                        const bgClass = TIER_BG[tier];

                        const label = tier === 0 ? "No Spend" :
                            isPrivacyMode ? '•••' :
                                (s.min !== Infinity && s.max !== -Infinity ? `${formatCompact(s.min)} - ${formatCompact(s.max)}` : "—");

                        return (
                            <div key={tier} className="flex items-center gap-2">
                                <div className={cn("w-3 h-3 rounded-sm flex-shrink-0", bgClass)} />
                                <div className="flex flex-col leading-tight">
                                    <span className="text-[10px] font-semibold text-gray-700">
                                        {label}
                                    </span>
                                    <span className="text-[9px] text-gray-400">
                                        {s.count} {s.count === 1 ? 'day' : 'days'}
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
