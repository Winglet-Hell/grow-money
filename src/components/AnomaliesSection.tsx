import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';
import { getCategoryIcon } from '../lib/categoryIcons';
import { cn, stringToColor, ordinal } from '../lib/utils';
import { monthKeyOf, dayOfMonthOf, monthKeyFromDate, shiftMonthKey, monthLabel } from '../lib/periods';
import { usePrivacy } from '../contexts/PrivacyContext';
import type { Transaction } from '../types';

interface AnomaliesSectionProps {
    transactions: Transaction[];
}

interface Deviation {
    category: string;
    amount: number;      // spent in the month (so far, for the running month)
    baseline: number;    // a usual month: by the same day for the running month, in full otherwise
    diffAbs: number;
    diffPercent: number;
}

// 'month': the running month so far, against what earlier months had spent by the same day.
// 'closed': last month in full, against an average earlier month.
type Mode = 'month' | 'closed';

// Categories by how far they are from usual, biggest gap first. A category with no history is
// compared with zero, so its first spending shows up as a jump.
function compareWithUsual(categories: Set<string>, amountOf: (category: string) => number, baselineOf: (category: string) => number): Deviation[] {
    const results: Deviation[] = [];
    categories.forEach(category => {
        const amount = amountOf(category);
        const baseline = baselineOf(category);
        if (amount === 0 && baseline === 0) return;
        const diffAbs = amount - baseline;
        results.push({ category, amount, baseline, diffAbs, diffPercent: baseline > 0 ? (diffAbs / baseline) * 100 : 100 });
    });
    return results.sort((a, b) => Math.abs(b.diffAbs) - Math.abs(a.diffAbs));
}

export function AnomaliesSection({ transactions }: AnomaliesSectionProps) {
    const { isPrivacyMode } = usePrivacy();
    const [isExpanded, setIsExpanded] = useState(false);
    const [chosenMode, setChosenMode] = useState<Mode | null>(null);

    const { running, closed, runningKey, closedKey, day } = useMemo(() => {
        const now = new Date();
        const runningKey = monthKeyFromDate(now);
        const closedKey = shiftMonthKey(runningKey, -1);
        const day = now.getDate();

        // Category -> month -> spent: whole months, and days 1..today of every month.
        const monthTotals: Record<string, Record<string, number>> = {};
        const toDateTotals: Record<string, Record<string, number>> = {};
        const categories = new Set<string>();
        const finishedMonths = new Set<string>(); // finished months with any spending at all

        transactions.forEach(t => {
            if (t.type !== 'expense') return;
            const key = monthKeyOf(t.date);
            if (!key || key > runningKey) return;
            const amount = Math.abs(t.amount);
            categories.add(t.category);

            if ((dayOfMonthOf(t.date) ?? 0) <= day) {
                const toDate = (toDateTotals[t.category] ??= {});
                toDate[key] = (toDate[key] || 0) + amount;
            }
            if (key === runningKey) return;

            finishedMonths.add(key);
            const totals = (monthTotals[t.category] ??= {});
            totals[key] = (totals[key] || 0) + amount;
        });

        // Averages run over every finished month in the data, a month without the category
        // counting as zero — as on the Expenses page. Averaging only the months a category
        // appeared in made an occasional purchase look monthly and an ordinary month without
        // it a big drop.
        const finished = [...finishedMonths];
        const beforeClosed = finished.filter(m => m < closedKey);
        const average = (byMonth: Record<string, number> | undefined, months: string[]) =>
            months.length ? months.reduce((sum, m) => sum + (byMonth?.[m] || 0), 0) / months.length : 0;

        return {
            // The running month is held against the same stretch of earlier months: by the 23rd a
            // usual month has not spent a whole month's worth yet, so a full-month average would
            // hide an overspend until the month is nearly over.
            running: compareWithUsual(categories, c => toDateTotals[c]?.[runningKey] || 0, c => average(toDateTotals[c], finished)),
            closed: compareWithUsual(categories, c => monthTotals[c]?.[closedKey] || 0, c => average(monthTotals[c], beforeClosed)),
            runningKey,
            closedKey,
            day,
        };
    }, [transactions]);

    const formatMoney = (val: number) => {
        // Short format: 1.5k, 20k
        if (Math.abs(val) >= 1000) return (val / 1000).toFixed(0) + 'k';
        return Math.round(val).toString();
    };
    const money = (val: number) => (isPrivacyMode ? '•••' : formatMoney(val));

    if (running.length === 0 && closed.length === 0) return null;

    // The running month by default, once it has any spending; last month until then.
    const mode: Mode = chosenMode ?? (running.some(d => d.amount > 0) ? 'month' : 'closed');
    const anomalies = mode === 'month' ? running : closed;
    const runningMonthName = monthLabel(runningKey, 'long').replace(/ \d{4}$/, '');
    const closedMonthName = monthLabel(closedKey, 'long');

    const chooseMode = (next: Mode) => {
        setChosenMode(next);
        setIsExpanded(false);
    };

    return (
        <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                <h3 className="text-lg font-semibold text-gray-900">Category Spending Deviations</h3>
                <div className="flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto">
                    <button
                        onClick={() => chooseMode('month')}
                        className={cn(
                            "flex-1 sm:flex-none px-3 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap",
                            mode === 'month' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                        )}
                    >
                        {runningMonthName} so far
                    </button>
                    <button
                        onClick={() => chooseMode('closed')}
                        className={cn(
                            "flex-1 sm:flex-none px-3 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap",
                            mode === 'closed' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                        )}
                    >
                        {closedMonthName}
                    </button>
                </div>
            </div>
            <p className="text-sm text-gray-500 mb-5">
                {mode === 'month'
                    ? `Spent by the ${ordinal(day)} against what you usually spend by the ${ordinal(day)}`
                    : `${closedMonthName} against your average month`}
            </p>

            {anomalies.length === 0 ? (
                <p className="text-sm text-gray-400">No spending in {mode === 'month' ? runningMonthName : closedMonthName} yet.</p>
            ) : (
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
                                    <div className="text-2xl font-bold text-gray-900">{money(item.amount)}</div>
                                    <div className="text-xs text-gray-400 mt-0.5">
                                        {mode === 'month'
                                            ? `usually ${money(item.baseline)} by the ${ordinal(day)}`
                                            : `avg ${money(item.baseline)}`}
                                    </div>
                                </div>

                                <div className={cn(
                                    "flex items-center gap-0.5 text-xs font-semibold px-2 py-1 rounded-full",
                                    isBad ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                                )}>
                                    {isBad ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                    <span>{isBad && !isPrivacyMode ? '+' : ''}{money(item.diffAbs)}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

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
