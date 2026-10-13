import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Upload } from 'lucide-react';
import type { Transaction } from '../types';
import { SummaryCards } from '../components/SummaryCards';
import { Charts } from '../components/Charts';
import { TransactionTable } from '../components/TransactionTable';
import { RecurringStrip } from '../components/RecurringStrip';
import { useCategoryLimits } from '../hooks/useCategoryLimits';
import { activeLimits, monthlyBudget } from '../lib/budget';
import { cn, getFormattedDateRange, formatDate } from '../lib/utils';
import {
    filterByPeriod, monthKeyFromDate, shiftMonthKey, monthLabel, daysInMonth,
    type DashboardPeriod,
} from '../lib/periods';

interface DashboardPageProps {
    transactions: Transaction[];
    onImport: () => void;
}

type Preset = 'this' | 'last' | 'all';
const PRESETS: { id: Preset; label: string }[] = [
    { id: 'this', label: 'This month' },
    { id: 'last', label: 'Last month' },
    { id: 'all', label: 'All time' },
];
const STORAGE_KEY = 'dashboardPeriod';

const presetToPeriod = (preset: Preset, thisKey: string): DashboardPeriod => {
    if (preset === 'all') return { kind: 'all' };
    return { kind: 'month', key: preset === 'this' ? thisKey : shiftMonthKey(thisKey, -1) };
};

// Per-device convenience only; falls back to the running month whenever storage is unavailable.
const readStoredPreset = (): Preset => {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        return v === 'last' || v === 'all' ? v : 'this';
    } catch {
        return 'this';
    }
};
const storePreset = (preset: Preset) => {
    try { localStorage.setItem(STORAGE_KEY, preset); } catch { /* private mode etc. */ }
};

const localDateKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;


export function DashboardPage({ transactions, onImport }: DashboardPageProps) {
    const today = new Date();
    const thisKey = monthKeyFromDate(today);
    const lastKey = shiftMonthKey(thisKey, -1);

    const [period, setPeriod] = useState<DashboardPeriod>(() => presetToPeriod(readStoredPreset(), thisKey));

    // Category limits double as the monthly budget for the pace card and the target line.
    const { limits, loading: limitsLoading } = useCategoryLimits();
    const budget = useMemo(() => monthlyBudget(limits, transactions), [limits, transactions]);
    const categoryLimits = useMemo(() => activeLimits(limits, transactions), [limits, transactions]);

    const periodTransactions = useMemo(() => filterByPeriod(transactions, period), [transactions, period]);

    const lastDataDate = useMemo(
        () => transactions.reduce<string | null>((max, t) => (!max || t.date > max ? t.date : max), null),
        [transactions]
    );

    const choosePreset = (preset: Preset) => {
        setPeriod(presetToPeriod(preset, thisKey));
        storePreset(preset);
    };
    const chooseMonth = (key: string) => {
        setPeriod({ kind: 'month', key });
        if (key === thisKey) storePreset('this');
        else if (key === lastKey) storePreset('last');
    };

    const activePreset: Preset | null =
        period.kind === 'all' ? 'all'
            : period.key === thisKey ? 'this'
                : period.key === lastKey ? 'last'
                    : null;

    // The white pill behind the chosen period slides over to the next choice. It is measured from
    // the chosen tab, whose width differs per label and on phones, where the tabs share the row.
    const tabsRef = useRef<HTMLDivElement>(null);
    const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
    const chosenTab = period.kind === 'all' ? 'all' : period.key;
    useLayoutEffect(() => {
        const tabs = tabsRef.current;
        if (!tabs) return;
        const measure = () => {
            const chosen = tabs.querySelector<HTMLElement>('[aria-selected="true"]');
            if (chosen) setPill({ left: chosen.offsetLeft, width: chosen.offsetWidth });
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(tabs);
        return () => observer.disconnect();
    }, [chosenTab]);

    const isCurrentMonth = period.kind === 'month' && period.key === thisKey;
    const periodLabel = period.kind === 'all' ? 'All time' : monthLabel(period.key);

    // A running month with no rows usually means the newest statement isn't imported yet.
    const periodIsEmpty = period.kind === 'month' && periodTransactions.length === 0 && transactions.length > 0;
    // Data lagging behind today by a couple of days makes the pace/projection read low —
    // say so instead of letting the numbers look authoritative.
    const staleDays = lastDataDate
        ? Math.floor((Date.parse(localDateKey(today)) - Date.parse(lastDataDate.slice(0, 10))) / 86_400_000)
        : 0;
    const showStaleHint = isCurrentMonth && !periodIsEmpty && staleDays >= 2;

    const badge = period.kind === 'all'
        ? getFormattedDateRange(transactions)
        : isCurrentMonth
            ? `${periodLabel} · day ${Math.min(today.getDate(), daysInMonth(period.key))} of ${daysInMonth(period.key)}`
            : periodLabel;

    return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-8">
            {/* Dashboard Header */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
                    <p className="text-gray-500">
                        {period.kind === 'all'
                            ? 'Overview of your financial health across all imported data'
                            : isCurrentMonth
                                ? `How ${periodLabel} is going so far`
                                : `How ${periodLabel} went`}
                    </p>
                </div>

                {/* Right-aligned on wide screens, the period badge goes before the tabs: after them, its
                    text — "October 2026 · day 13 of 31", "September 2026" — moved the tabs on every switch. */}
                <div className="flex flex-col sm:flex-row lg:flex-row-reverse sm:items-center gap-3 w-full lg:w-auto">
                    <div ref={tabsRef} className="relative flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto" role="tablist" aria-label="Dashboard period">
                        {pill && (
                            <span
                                aria-hidden
                                className="absolute top-1 bottom-1 left-0 rounded-md bg-white shadow-sm transition-[transform,width] duration-300 ease-out"
                                style={{ transform: `translateX(${pill.left}px)`, width: pill.width }}
                            />
                        )}
                        {PRESETS.map(p => (
                            <button
                                key={p.id}
                                role="tab"
                                aria-selected={activePreset === p.id}
                                onClick={() => choosePreset(p.id)}
                                className={cn(
                                    "relative flex-1 sm:flex-none px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                                    activePreset === p.id ? "text-gray-900" : "text-gray-500 hover:text-gray-900"
                                )}
                            >
                                {p.label}
                            </button>
                        ))}
                        {/* A month picked from the trend chart gets its own chip so the selection stays visible. */}
                        {activePreset === null && period.kind === 'month' && (
                            <button
                                role="tab"
                                aria-selected
                                className="relative flex-1 sm:flex-none px-3 py-1.5 rounded-md text-sm font-medium text-emerald-700 whitespace-nowrap"
                            >
                                {monthLabel(period.key, 'short')}
                            </button>
                        )}
                    </div>

                    <div className="px-3 py-1.5 bg-white/50 border border-emerald-100 rounded-lg text-xs md:text-sm font-medium text-emerald-700 flex items-center gap-2 shadow-sm whitespace-nowrap self-start sm:self-auto">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        {badge}
                    </div>
                </div>
            </div>

            {periodIsEmpty && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100 text-sm text-amber-800">
                    <Upload className="w-5 h-5 shrink-0 text-amber-500" />
                    <div className="flex-1">
                        <span className="font-semibold">Nothing imported for {periodLabel} yet.</span>{' '}
                        Import the latest statement to see it here
                        {lastDataDate && <> — the data currently ends on {formatDate(lastDataDate)}</>}.
                    </div>
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                        <button
                            onClick={onImport}
                            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 transition-colors whitespace-nowrap shadow-sm"
                        >
                            Import statement
                        </button>
                        {period.key !== lastKey && (
                            <button
                                onClick={() => choosePreset('last')}
                                className="px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-800 font-medium hover:bg-amber-100 transition-colors whitespace-nowrap"
                            >
                                Show last month
                            </button>
                        )}
                    </div>
                </div>
            )}

            {showStaleHint && lastDataDate && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100 text-xs text-gray-500">
                    <CalendarClock className="w-4 h-4 shrink-0 text-gray-400" />
                    <span className="flex-1">
                        Latest transaction is from <span className="font-semibold text-gray-700">{formatDate(lastDataDate)}</span> —
                        the daily pace and projection assume nothing was spent since.
                    </span>
                    <button
                        onClick={onImport}
                        className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 font-medium hover:bg-gray-100 transition-colors whitespace-nowrap"
                    >
                        Import newer statement
                    </button>
                </div>
            )}

            <SummaryCards transactions={transactions} period={period} budget={budget} />
            <RecurringStrip transactions={transactions} />
            <Charts transactions={transactions} period={period} budget={budget} budgetReady={!limitsLoading} limits={categoryLimits} onSelectMonth={chooseMonth} />
            <TransactionTable
                transactions={periodTransactions}
                title={period.kind === 'all' ? 'Recent Transactions' : 'Transactions'}
                subtitle={period.kind === 'all' ? undefined : periodLabel}
            />
        </div>
    );
}
