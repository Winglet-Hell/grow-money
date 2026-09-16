import { useMemo, useState } from 'react';
import { CalendarClock, Upload, FileSpreadsheet } from 'lucide-react';
import type { Transaction } from '../types';
import type { ImportMeta } from '../lib/importing';
import { SummaryCards } from '../components/SummaryCards';
import { Charts } from '../components/Charts';
import { TransactionTable } from '../components/TransactionTable';
import { useCategoryLimits } from '../hooks/useCategoryLimits';
import { cn, getFormattedDateRange, formatDate } from '../lib/utils';
import {
    filterByPeriod, monthKeyFromDate, shiftMonthKey, monthLabel, daysInMonth,
    type DashboardPeriod,
} from '../lib/periods';

interface DashboardPageProps {
    transactions: Transaction[];
    importMeta: ImportMeta | null;
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

// "today 14:32", "yesterday 09:10", "12 Sep 14:32", "12 Sep 2025"
function formatImportTime(iso: string, now: Date): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(d);
    const dayKey = localDateKey(d);
    if (dayKey === localDateKey(now)) return `today ${time}`;
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (dayKey === localDateKey(yesterday)) return `yesterday ${time}`;
    const sameYear = d.getFullYear() === now.getFullYear();
    const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).format(d);
    return sameYear ? `${day} ${time}` : day;
}

export function DashboardPage({ transactions, importMeta, onImport }: DashboardPageProps) {
    const today = new Date();
    const thisKey = monthKeyFromDate(today);
    const lastKey = shiftMonthKey(thisKey, -1);

    const [period, setPeriod] = useState<DashboardPeriod>(() => presetToPeriod(readStoredPreset(), thisKey));

    // Category limits double as the monthly budget for the pace card and the target line.
    const { limits } = useCategoryLimits();
    const budget = useMemo(() => Object.values(limits).reduce((sum, v) => sum + v, 0), [limits]);

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
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
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

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full lg:w-auto">
                    <div className="flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto" role="tablist" aria-label="Dashboard period">
                        {PRESETS.map(p => (
                            <button
                                key={p.id}
                                role="tab"
                                aria-selected={activePreset === p.id}
                                onClick={() => choosePreset(p.id)}
                                className={cn(
                                    "flex-1 sm:flex-none px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap",
                                    activePreset === p.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
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
                                className="flex-1 sm:flex-none px-3 py-1.5 rounded-md text-sm font-medium bg-white text-emerald-700 shadow-sm whitespace-nowrap"
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

            {/* Freshness line: when the data on this device was last replaced, and the way to do it again. */}
            <div className="-mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                <span className="flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    {importMeta
                        ? <>Imported {formatImportTime(importMeta.at, today)} · {importMeta.count.toLocaleString('en-US')} rows{importMeta.fileName ? <span className="hidden sm:inline"> · {importMeta.fileName}</span> : null}</>
                        : 'Import time unknown'}
                </span>
                <button
                    onClick={onImport}
                    className="inline-flex items-center gap-1 font-medium text-emerald-600 hover:text-emerald-700 hover:underline"
                >
                    <Upload className="w-3.5 h-3.5" />
                    Import new statement
                </button>
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
            <Charts transactions={transactions} period={period} budget={budget} onSelectMonth={chooseMonth} />
            <TransactionTable
                transactions={periodTransactions}
                title={period.kind === 'all' ? 'Recent Transactions' : 'Transactions'}
                subtitle={period.kind === 'all' ? undefined : periodLabel}
            />
        </div>
    );
}
