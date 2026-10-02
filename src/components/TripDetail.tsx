import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowDownUp, ArrowLeft, Calendar, CalendarClock, Check, ChevronDown, House, Lightbulb, MapPin, Pencil, Plane, Plus, Search,
    Sparkles, Target, Wallet, X,
} from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, LabelList } from 'recharts';
import type { Transaction, Trip } from '../types';
import { usePrivacy } from '../contexts/PrivacyContext';
import { getCategoryIcon } from '../lib/categoryIcons';
import { cn, formatDate, getTransactionNote, getTransactionTitle, stringToColor } from '../lib/utils';
import {
    daysBetween, dismissSuggestion, healTripLists, localDayKey, resolveTrip, setTransactionCounted, suggestTripTransactions, tripStatus,
    type TripEntry, type TripLists, type TripSuggestion,
} from '../lib/tripUtils';
import { budgetStatus, compareWithHome, dailySpending, tripMetrics, type BudgetStatus } from '../lib/tripStats';
import { dateKeyOf } from '../lib/periods';
import { autoTripIcon, tripIcon } from '../lib/tripIcons';
import { deleteTrip, updateTrip } from '../lib/tripsStore';
import {
    formatDayShort, formatDayWithWeekday, formatNative, formatRub, formatRubCompact, formatRubSigned, formatTripRange, pluralDays,
} from '../lib/tripFormat';
import { TripFormModal, type TripFormValues } from './TripFormModal';
import { TripTransactionPicker } from './TripTransactionPicker';
import { ConfirmDialog } from './ConfirmDialog';

interface TripDetailProps {
    trip: Trip;
    trips: Trip[];
    transactions: Transaction[];
    onBack: () => void;
    onDeleted: () => void;
}

const SUGGESTIONS_SHOWN = 3;
const HOME_ROWS_SHOWN = 8;
const CATEGORIES_SHOWN = 7;
const LABELLED_BARS_MAX = 14; // more bars than this and the amount labels run into each other


// The chart's and the list's name for "paid before the first day".
const BEFORE = 'before';

interface ListSection {
    key: string;
    title: string;
    note?: string;
    total: number;
    entries: TripEntry[];
}

const percentChange = (now: number, before: number) => (before > 0 ? Math.round((now / before - 1) * 100) : null);

export function TripDetail({ trip, trips, transactions, onBack, onDeleted }: TripDetailProps) {
    const { isPrivacyMode } = usePrivacy();
    const money = (n: number) => (isPrivacyMode ? '••••' : formatRub(n));

    const [isEditing, setIsEditing] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [filterDay, setFilterDay] = useState<string | null>(null);
    const [filterCategory, setFilterCategory] = useState<string | null>(null);
    const [showAllSuggestions, setShowAllSuggestions] = useState(false);
    const [showAllHomeRows, setShowAllHomeRows] = useState(false);
    const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
    // A trip under way reads best from today backwards; a finished one from its first day.
    const [latestFirst, setLatestFirst] = useState(() => tripStatus(trip) === 'ongoing');
    const [showSwitchedOff, setShowSwitchedOff] = useState(false);
    const [showAllCategories, setShowAllCategories] = useState(false);

    const resolved = useMemo(() => resolveTrip(trip, transactions), [trip, transactions]);
    const metrics = useMemo(() => tripMetrics(trip, trips, transactions, resolved), [trip, trips, transactions, resolved]);
    const comparison = useMemo(() => compareWithHome(trip, resolved, metrics), [trip, resolved, metrics]);
    const daily = useMemo(() => dailySpending(trip, resolved), [trip, resolved]);
    const suggestions = useMemo(() => suggestTripTransactions(trip, trips, transactions), [trip, trips, transactions]);
    const status = tripStatus(trip);
    const icon = useMemo(() => tripIcon(trip, transactions), [trip, transactions]);
    const budget = useMemo(() => budgetStatus(trip, metrics), [trip, metrics]);

    const breakdown = useMemo(() => {
        const byCategory = new Map<string, number>();
        for (const t of resolved.counted) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + Math.abs(t.amount));
        const rows = [...byCategory.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
        const max = rows[0]?.amount ?? 0;
        return rows.map(r => ({ ...r, share: metrics.total ? (r.amount / metrics.total) * 100 : 0, width: max ? (r.amount / max) * 100 : 0 }));
    }, [resolved, metrics.total]);

    const biggest = useMemo(
        () => [...resolved.counted].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 5),
        [resolved]
    );

    const listCounts = useMemo(() => ({
        off: resolved.entries.filter(e => e.state === 'excluded').length,
        homeBills: resolved.entries.filter(e => e.state === 'home-bill').length,
    }), [resolved]);

    const visibleEntries = useMemo(() => {
        const q = search.trim().toLowerCase();
        return resolved.entries.filter(({ tx, beforeTrip }) => {
            if (filterDay === BEFORE ? !beforeTrip : filterDay && !tx.date.startsWith(filterDay)) return false;
            if (filterCategory && tx.category !== filterCategory) return false;
            if (!q) return true;
            return (tx.category || '').toLowerCase().includes(q) ||
                (tx.note || '').toLowerCase().includes(q) ||
                (tx.account || '').toLowerCase().includes(q) ||
                getTransactionTitle(tx).toLowerCase().includes(q) ||
                String(Math.abs(Math.round(tx.amount))).includes(q);
        });
    }, [resolved, search, filterDay, filterCategory]);

    // Counted spending by day — bookings first, then each day of the trip, then anything after
    // it — with what's switched off kept apart at the bottom.
    const { sections, switchedOff } = useMemo(() => {
        const byKey = new Map<string, TripEntry[]>();
        const off: TripEntry[] = [];
        for (const entry of visibleEntries) {
            if (entry.state !== 'counted') { off.push(entry); continue; }
            const day = dateKeyOf(entry.tx.date) ?? '';
            const key = day < trip.startDate ? BEFORE : day > trip.endDate ? 'after' : day;
            const list = byKey.get(key);
            if (list) list.push(entry); else byKey.set(key, [entry]);
        }
        const keys = [...byKey.keys()].sort((a, b) => {
            const rank = (k: string) => (k === BEFORE ? 0 : k === 'after' ? 2 : 1);
            return rank(a) - rank(b) || a.localeCompare(b);
        });
        if (latestFirst) keys.reverse();
        const list: ListSection[] = keys.map(key => {
            const entries = byKey.get(key)!.sort((a, b) => (a.tx.index ?? 0) - (b.tx.index ?? 0));
            const total = entries.reduce((sum, e) => sum + Math.abs(e.tx.amount), 0);
            if (key === BEFORE) return { key, title: 'Booked ahead', note: 'paid before the first day', total, entries };
            if (key === 'after') return { key, title: 'After the trip', total, entries };
            return { key, title: `Day ${daysBetween(trip.startDate, key) + 1}`, note: formatDayWithWeekday(key), total, entries };
        });
        return { sections: list, switchedOff: off.sort((a, b) => a.tx.date.localeCompare(b.tx.date)) };
    }, [visibleEntries, trip.startDate, trip.endDate, latestFirst]);

    // Point the stored lists at today's ids (see healTripLists) — once per trip and statement,
    // quietly: the user didn't ask for it, and a failed attempt must not retry in a loop.
    const healedFor = useRef<{ id: string; txs: Transaction[] } | null>(null);
    useEffect(() => {
        if (transactions.length === 0) return;
        if (healedFor.current?.id === trip.id && healedFor.current.txs === transactions) return;
        healedFor.current = { id: trip.id, txs: transactions };
        const healed = healTripLists(trip, transactions);
        if (healed) updateTrip(trip.id, healed, { quiet: true }).catch(() => undefined);
    }, [trip, transactions]);

    // Failures are reported by the store (banner on the page) and undone there.
    const save = (lists: TripLists) => { updateTrip(trip.id, lists).catch(() => undefined); };
    const toggle = (entry: TripEntry) => save(setTransactionCounted(trip, entry.tx, entry.state !== 'counted', transactions));
    const add = (tx: Transaction) => save(setTransactionCounted(trip, tx, true, transactions));
    const dismiss = (tx: Transaction) => save(dismissSuggestion(trip, tx, transactions));

    const saveDetails = async ({ icon: chosen, budget: plan, ...details }: TripFormValues) => {
        // Icon and budget are only sent when they changed: storing them needs new columns (see tripsStore).
        const patch: Partial<Omit<Trip, 'id'>> = { ...details };
        if (chosen !== (trip.icon ?? null)) patch.icon = chosen;
        if (plan !== (trip.budget ?? null)) patch.budget = plan;
        await updateTrip(trip.id, patch, { quiet: true }); // the form shows its own error
        setIsEditing(false);
    };

    const confirmDelete = async () => {
        setIsDeleting(true);
        try {
            await deleteTrip(trip.id);
            onDeleted();
        } catch (e) {
            setDeleteError(`Couldn't delete the trip: ${e instanceof Error ? e.message : String(e)}`);
            setIsDeleting(false);
            setIsConfirmingDelete(false);
        }
    };

    const copyForAI = async () => {
        const round = (n: number | null) => (n === null ? null : Math.round(n));
        const data = {
            trip: {
                name: trip.name.trim(),
                dates: `${trip.startDate} – ${trip.endDate}`,
                days: metrics.days,
                currency: 'RUB',
                total_cost: round(metrics.total),
                booked_ahead: round(metrics.bookedAhead),
                spent_on_the_trip: round(metrics.onTrip),
                per_day_on_the_trip: round(metrics.onTripPerDay),
                everyday_spending_per_day_at_home: round(metrics.home?.perDay ?? null),
                extra_cost_vs_staying_home: round(metrics.extraVsHome),
                budget: budget ? Math.round(budget.budget) : null,
                budget_left: budget ? Math.round(budget.left) : null,
            },
            breakdown: breakdown.map(c => ({ category: c.name, amount: Math.round(c.amount), share: `${Math.round(c.share)}%` })),
            everyday_per_day_vs_home: comparison?.rows.map(r => ({ category: r.category, trip: Math.round(r.tripPerDay), home: Math.round(r.homePerDay) })) ?? [],
            daily_spending: daily.map(d => ({ date: d.day, amount: Math.round(d.amount) })),
            biggest_expenses: [...resolved.counted]
                .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
                .slice(0, 15)
                .map(t => ({ item: getTransactionTitle(t), category: t.category, amount: Math.round(Math.abs(t.amount)), date: t.date })),
        };
        const prompt = `I am providing JSON data on my expenses for a trip called "${trip.name.trim()}" (amounts in RUB, positive = spent).
"booked_ahead" is what I paid before the first day (flights, hotels, visas). Rent, utility bills, subscriptions and insurance at home are left out.
"everyday_spending_per_day_at_home" is my usual daily spending at home (90 days before the trip, without travel, rent, bills and big purchases), and "extra_cost_vs_staying_home" is the trip's total minus that amount for the same number of days.
Please analyse it and give me:
1. A summary of what the trip cost and what drove the cost.
2. How my everyday spending on the trip differed from home, category by category.
3. Outliers or unusual daily spikes.
4. Concrete ways to spend less on a similar trip next time.

Data:
${JSON.stringify(data, null, 2)}`;
        try {
            await navigator.clipboard.writeText(prompt);
            setCopyState('copied');
        } catch {
            setCopyState('failed');
        }
        window.setTimeout(() => setCopyState('idle'), 2500);
    };

    const shownSuggestions = showAllSuggestions ? suggestions : suggestions.slice(0, SUGGESTIONS_SHOWN);
    const homeRows = comparison ? (showAllHomeRows ? comparison.rows : comparison.rows.slice(0, HOME_ROWS_SHOWN)) : [];
    const maxDaily = Math.max(1, ...daily.map(d => d.amount));
    const labelBars = daily.length <= LABELLED_BARS_MAX && !isPrivacyMode;
    // Bookings get a bar of their own in front of the days. A month of hotels would flatten every
    // day beside it, so a bar taller than the days is cut to fit and striped; the label says the full sum.
    const beforeCap = maxDaily > 1 ? maxDaily * 1.25 : metrics.bookedAhead;
    const beforeCut = metrics.bookedAhead > beforeCap;
    const barLabel = (n: number) => (isPrivacyMode || n <= 0 ? '' : formatRubCompact(n));
    const chartData = [
        ...(metrics.bookedAhead > 0
            ? [{ key: BEFORE, amount: metrics.bookedAhead, value: beforeCut ? beforeCap : metrics.bookedAhead, label: barLabel(metrics.bookedAhead) }]
            : []),
        ...daily.map(d => ({ key: d.day, amount: d.amount, value: d.amount, label: labelBars ? barLabel(d.amount) : '' })),
    ];
    const anyBarLabel = chartData.some(d => d.label);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex items-center gap-3 w-full sm:w-auto min-w-0">
                    <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0" aria-label="Back to all trips">
                        <ArrowLeft className="w-6 h-6 text-gray-600" />
                    </button>
                    <div className="w-11 h-11 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center text-2xl leading-none flex-shrink-0" aria-hidden>
                        {icon ?? <Plane className="w-5 h-5 text-emerald-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{trip.name}</h1>
                            <button
                                onClick={() => setIsEditing(true)}
                                className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-all flex-shrink-0"
                                title="Change the name or the dates"
                                aria-label="Edit trip"
                            >
                                <Pencil className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-gray-500 text-sm flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                            <span className="inline-flex items-center gap-1.5 tabular-nums"><Calendar className="w-4 h-4 flex-shrink-0" />{formatTripRange(trip.startDate, trip.endDate)}</span>
                            <span className="text-gray-300">•</span>
                            <span>{pluralDays(metrics.days)}</span>
                            {status === 'ongoing' && <span className="px-1.5 py-px rounded-md border text-[10px] font-semibold uppercase tracking-wide bg-emerald-50 text-emerald-700 border-emerald-200">Now · day {daysBetween(trip.startDate, localDayKey()) + 1} of {metrics.days}</span>}
                            {status === 'upcoming' && <span className="px-1.5 py-px rounded-md border text-[10px] font-semibold uppercase tracking-wide bg-blue-50 text-blue-700 border-blue-200">Upcoming</span>}
                            {!budget && status !== 'past' && (
                                <button onClick={() => setIsEditing(true)} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900">
                                    <Target className="w-3.5 h-3.5" /> Set a budget
                                </button>
                            )}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                    <button
                        onClick={copyForAI}
                        className="flex items-center justify-center gap-2 px-3 py-3 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors text-sm font-medium whitespace-nowrap"
                        title="Copy an analysis prompt with this trip's numbers"
                    >
                        {copyState === 'copied' ? <Check className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                        <span>{copyState === 'copied' ? 'Copied' : copyState === 'failed' ? "Couldn't copy" : 'AI Analysis'}</span>
                    </button>
                    <button
                        onClick={() => setIsPickerOpen(true)}
                        className="flex items-center justify-center gap-2 px-3 py-3 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors text-sm font-medium whitespace-nowrap"
                    >
                        <Plus className="w-4 h-4" />
                        <span>Add transaction</span>
                    </button>
                </div>
            </div>

            {deleteError && (
                <div className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700" role="alert">
                    <span>{deleteError}</span>
                    <button onClick={() => setDeleteError(null)} className="p-0.5 hover:text-red-900" aria-label="Dismiss"><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Suggestions */}
            {suggestions.length > 0 && (
                <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 sm:p-5">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-amber-500" />
                        Looks like part of this trip
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5 mb-2">
                        Travel payments around these dates that no trip counts yet. Add the ones that belong here; × hides one for good.
                    </p>
                    <div className="divide-y divide-amber-100">
                        {shownSuggestions.map(s => (
                            <SuggestionRow key={s.tx.id} suggestion={s} money={money} onAdd={add} onDismiss={dismiss} />
                        ))}
                    </div>
                    {suggestions.length > SUGGESTIONS_SHOWN && (
                        <button onClick={() => setShowAllSuggestions(v => !v)} className="mt-2 text-xs font-medium text-amber-700 hover:text-amber-900">
                            {showAllSuggestions ? 'Show fewer' : `Show ${suggestions.length - SUGGESTIONS_SHOWN} more`}
                        </button>
                    )}
                </div>
            )}

            {budget && <BudgetCard budget={budget} money={money} onEdit={() => setIsEditing(true)} />}

            {/* Summary */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 md:gap-4">
                <Tile
                    title="Total"
                    value={money(metrics.total)}
                    sub={`${metrics.perDay !== null ? `${money(metrics.perDay)}/day · ` : ''}${resolved.counted.length} transactions`}
                    icon={<Wallet className="w-9 h-9 text-emerald-500" strokeWidth={1.5} />}
                />
                <Tile
                    title="Booked ahead"
                    value={money(metrics.bookedAhead)}
                    sub={metrics.bookedAheadCount > 0
                        ? `${metrics.bookedAheadCount} payment${metrics.bookedAheadCount === 1 ? '' : 's'} before ${formatDate(trip.startDate)}`
                        : 'nothing paid before the trip'}
                    icon={<CalendarClock className="w-9 h-9 text-blue-500" strokeWidth={1.5} />}
                />
                <Tile
                    title="On the trip"
                    value={money(metrics.onTrip)}
                    sub={metrics.onTripPerDay !== null
                        ? `${money(metrics.onTripPerDay)}/day${metrics.daysCovered < metrics.days ? ` over ${pluralDays(metrics.daysCovered)} so far` : ''}`
                        : 'the trip hasn\'t started'}
                    icon={<MapPin className="w-9 h-9 text-purple-500" strokeWidth={1.5} />}
                />
                <Tile
                    title="vs. staying home"
                    value={metrics.extraVsHome === null ? '—' : isPrivacyMode ? '••••' : formatRubSigned(metrics.extraVsHome)}
                    sub={metrics.home
                        ? `beyond ${money(metrics.home.perDay)}/day of everyday spending at home`
                        : 'not enough history before this trip to compare'}
                    icon={<House className="w-9 h-9 text-orange-400" strokeWidth={1.5} />}
                />
            </div>

            {/* Biggest spends + breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h3 className="font-bold text-lg text-gray-900 mb-4">Biggest spends</h3>
                    <div className="space-y-3">
                        {biggest.map(t => {
                            const Icon = getCategoryIcon(t.category);
                            const color = stringToColor(t.category);
                            return (
                                <div key={t.id} className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 border border-gray-100">
                                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", color.bg, color.text)}>
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-gray-900 truncate">{getTransactionTitle(t)}</p>
                                        {getTransactionNote(t) && <p className="text-xs text-gray-600 truncate" title={getTransactionNote(t)}>{getTransactionNote(t)}</p>}
                                        <p className="text-xs text-gray-500 truncate">{t.category}</p>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-gray-900 whitespace-nowrap tabular-nums">{money(Math.abs(t.amount))}</div>
                                        <div className="text-xs text-gray-400">{formatDate(t.date)}</div>
                                    </div>
                                </div>
                            );
                        })}
                        {biggest.length === 0 && <p className="text-gray-400 text-sm text-center py-4">Nothing counted yet</p>}
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h3 className="font-bold text-lg text-gray-900 mb-4">Spending breakdown</h3>
                    {/* No scroll box: a cut-off list with an inner scrollbar read as if the rest were missing. */}
                    <div className="space-y-3">
                        {(showAllCategories ? breakdown : breakdown.slice(0, CATEGORIES_SHOWN)).map(item => {
                            const Icon = getCategoryIcon(item.name);
                            const color = stringToColor(item.name);
                            const active = filterCategory === item.name;
                            return (
                                <button
                                    key={item.name}
                                    type="button"
                                    onClick={() => setFilterCategory(active ? null : item.name)}
                                    className={cn(
                                        "w-full text-left flex items-center gap-3 p-2 rounded-xl transition-all border border-transparent hover:bg-gray-50",
                                        active && "bg-emerald-50 border-emerald-200 shadow-sm",
                                        filterCategory && !active && "opacity-40 hover:opacity-100"
                                    )}
                                    title="Show only this category in the list below"
                                >
                                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", color.bg, color.text)}>
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-1.5">
                                        <div className="flex justify-between items-center text-sm">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="font-medium text-gray-900 truncate">{item.name}</span>
                                                <span className="text-gray-400 text-xs whitespace-nowrap">{Math.round(item.share)}%</span>
                                            </div>
                                            <span className="font-bold text-gray-900 whitespace-nowrap ml-2 tabular-nums">{money(item.amount)}</span>
                                        </div>
                                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full" style={{ width: `${item.width}%`, backgroundColor: color.hex }} />
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                        {breakdown.length === 0 && <p className="text-gray-400 text-sm text-center py-4">Nothing counted yet</p>}
                    </div>
                    {breakdown.length > CATEGORIES_SHOWN && (
                        <button onClick={() => setShowAllCategories(v => !v)} className="mt-3 text-xs font-medium text-emerald-700 hover:text-emerald-900">
                            {showAllCategories ? 'Show fewer' : `Show all ${breakdown.length} categories`}
                        </button>
                    )}
                </div>
            </div>

            {/* Compared with home */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4">
                    <h3 className="font-bold text-lg text-gray-900">Everyday spending vs. home</h3>
                    {comparison && (
                        <p className="text-sm text-gray-500">
                            <span className="font-semibold text-gray-900 tabular-nums">{money(comparison.tripPerDay)}</span>/day there ·{' '}
                            <span className="font-semibold text-gray-900 tabular-nums">{money(comparison.homePerDay)}</span>/day at home
                            <DeltaBadge now={comparison.tripPerDay} before={comparison.homePerDay} />
                        </p>
                    )}
                </div>
                {comparison ? (
                    <>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-4 sm:gap-x-8 text-sm">
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 pb-2">Category</div>
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 pb-2 text-right">There</div>
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 pb-2 text-right">Home</div>
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 pb-2 text-right">Change</div>
                            {homeRows.map(r => (
                                <React.Fragment key={r.category}>
                                    <div className="py-1.5 border-t border-gray-50 text-gray-800 truncate">{r.category}</div>
                                    <div className="py-1.5 border-t border-gray-50 text-right tabular-nums text-gray-900">{money(r.tripPerDay)}</div>
                                    <div className="py-1.5 border-t border-gray-50 text-right tabular-nums text-gray-500">{money(r.homePerDay)}</div>
                                    <div className="py-1.5 border-t border-gray-50 text-right"><DeltaBadge now={r.tripPerDay} before={r.homePerDay} plain /></div>
                                </React.Fragment>
                            ))}
                        </div>
                        {comparison.rows.length > HOME_ROWS_SHOWN && (
                            <button onClick={() => setShowAllHomeRows(v => !v)} className="mt-2 text-xs font-medium text-emerald-700 hover:text-emerald-900">
                                {showAllHomeRows ? 'Show fewer' : `Show all ${comparison.rows.length} categories`}
                            </button>
                        )}
                        <p className="text-xs text-gray-400 mt-3 leading-snug">
                            Per day, on the same things: tickets, hotels, tours, visas, rent, bills and big purchases are left out.
                            Home is your everyday spending over the {metrics.home!.days} days at home before the trip.
                        </p>
                    </>
                ) : (
                    <p className="text-sm text-gray-400">
                        {metrics.daysCovered === 0
                            ? 'The trip hasn\'t started yet — the comparison appears once it has.'
                            : 'Not enough history before this trip: home is measured over the 90 days before it, and the statement starts too close.'}
                    </p>
                )}
            </div>

            {/* Daily activity */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-x-3 gap-y-0.5 mb-4">
                    <h3 className="font-bold text-lg text-gray-900">Daily activity</h3>
                    {metrics.bookedAhead > 0 && (
                        <span className="text-xs text-gray-400">
                            <span className="inline-block w-2 h-2 rounded-sm bg-blue-500 mr-1 align-middle" />
                            Before — {money(metrics.bookedAhead)} booked ahead{beforeCut ? ', bar cut to fit' : ''}
                        </span>
                    )}
                </div>
                <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: anyBarLabel ? 20 : 8, right: 0, left: 0, bottom: 0 }}>
                            <defs>
                                <pattern id="trip-before-cut" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                                    <rect width="6" height="6" fill="#3b82f6" />
                                    <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" strokeWidth="2.5" strokeOpacity="0.55" />
                                </pattern>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis
                                dataKey="key"
                                tickFormatter={(key: string) => (key === BEFORE ? 'Before' : formatDayShort(key))}
                                tick={{ fontSize: 12, fill: '#9ca3af' }}
                                axisLine={false}
                                tickLine={false}
                                interval="preserveStartEnd"
                                minTickGap={16}
                                dy={10}
                            />
                            <Tooltip
                                cursor={{ fill: '#f9fafb' }}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                labelFormatter={(key) => (key === BEFORE ? 'Paid before the trip' : formatDayWithWeekday(String(key), true))}
                                formatter={(_value, _name, item) => [money(Number(item?.payload?.amount ?? 0)), 'Spent']}
                            />
                            <Bar
                                dataKey="value"
                                radius={[8, 8, 0, 0]}
                                onClick={(data: { payload?: { key?: string } }) => {
                                    const key = data?.payload?.key;
                                    if (key) setFilterDay(filterDay === key ? null : key);
                                }}
                                className="cursor-pointer"
                            >
                                {chartData.map(entry => {
                                    const selected = filterDay === entry.key;
                                    const isBefore = entry.key === BEFORE;
                                    const opacity = filterDay ? (selected ? 1 : 0.15) : isBefore ? 0.85 : 0.3 + (entry.amount / maxDaily) * 0.7;
                                    return (
                                        <Cell
                                            key={entry.key}
                                            fill={isBefore ? (beforeCut ? 'url(#trip-before-cut)' : '#3b82f6') : '#10b981'}
                                            fillOpacity={opacity}
                                            stroke={selected ? (isBefore ? '#1d4ed8' : '#047857') : 'none'}
                                            strokeWidth={2}
                                        />
                                    );
                                })}
                                {anyBarLabel && (
                                    <LabelList dataKey="label" position="top" style={{ fontSize: '10px', fill: '#6b7280', fontWeight: 500 }} />
                                )}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Transactions */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex flex-col gap-1 min-w-0">
                        <h3 className="font-bold text-lg text-gray-900">Transactions</h3>
                        <p className="text-xs text-gray-500">
                            {resolved.counted.length} counted
                            {listCounts.off > 0 && ` · ${listCounts.off} switched off`}
                            {listCounts.homeBills > 0 && ` · ${listCounts.homeBills} home bill${listCounts.homeBills === 1 ? '' : 's'} left out`}
                            {' · '}tap one to switch it on or off
                        </p>
                        {listCounts.homeBills > 0 && (
                            <p className="text-xs text-gray-400">Rent, utility bills, subscriptions and insurance stay out of trips by themselves — tick one to count it.</p>
                        )}
                        {(filterDay || filterCategory) && (
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                {filterDay && (
                                    <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium border border-emerald-100">
                                        <Calendar className="w-3 h-3" />
                                        {filterDay === BEFORE ? 'Booked ahead' : formatDate(filterDay)}
                                        <button onClick={() => setFilterDay(null)} className="hover:text-emerald-900" aria-label="Clear day filter"><X className="w-3 h-3" /></button>
                                    </span>
                                )}
                                {filterCategory && (
                                    <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium border border-blue-100">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                        {filterCategory}
                                        <button onClick={() => setFilterCategory(null)} className="hover:text-blue-900" aria-label="Clear category filter"><X className="w-3 h-3" /></button>
                                    </span>
                                )}
                                <button onClick={() => { setFilterDay(null); setFilterCategory(null); }} className="text-xs text-gray-400 hover:text-gray-600 underline">
                                    Clear all
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto flex-shrink-0">
                        <div className="relative flex-1 sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search transactions…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
                            />
                        </div>
                        <button
                            onClick={() => setLatestFirst(v => !v)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                            title="Change the order of the days"
                        >
                            <ArrowDownUp className="w-3.5 h-3.5" />
                            {latestFirst ? 'Latest first' : 'Day 1 first'}
                        </button>
                    </div>
                </div>
                <div>
                    {sections.map(section => (
                        <div key={section.key}>
                            <div className="flex items-baseline justify-between gap-3 px-4 sm:px-6 py-2 bg-gray-50 border-y border-gray-100">
                                <div className="flex items-baseline gap-2 min-w-0 text-sm">
                                    <span className="font-semibold text-gray-800 whitespace-nowrap">{section.title}</span>
                                    {section.note && <span className="text-xs text-gray-400 truncate">{section.note}</span>}
                                </div>
                                <span className="text-sm font-semibold text-gray-700 tabular-nums whitespace-nowrap">{money(section.total)}</span>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {section.entries.map(entry => (
                                    <EntryRow
                                        key={entry.tx.id}
                                        entry={entry}
                                        isPrivacyMode={isPrivacyMode}
                                        money={money}
                                        onToggle={toggle}
                                        showDate={section.key === BEFORE || section.key === 'after'}
                                        inBookedGroup={section.key === BEFORE}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                    {switchedOff.length > 0 && (
                        <div>
                            <button
                                onClick={() => setShowSwitchedOff(v => !v)}
                                className="w-full flex items-baseline justify-between gap-3 px-4 sm:px-6 py-2.5 bg-gray-50 border-y border-gray-100 text-left hover:bg-gray-100/70 transition-colors"
                                aria-expanded={showSwitchedOff || !!search.trim()}
                            >
                                <span className="text-sm font-semibold text-gray-500">
                                    Switched off <span className="font-medium text-gray-400">· {switchedOff.length}</span>
                                </span>
                                <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                                    {showSwitchedOff || search.trim() ? 'Hide' : 'Show'}
                                    <ChevronDown className={cn("w-4 h-4 transition-transform", (showSwitchedOff || search.trim()) && "rotate-180")} />
                                </span>
                            </button>
                            {/* A search looks in here too, so its matches don't hide behind the fold. */}
                            {(showSwitchedOff || search.trim()) && (
                                <div className="divide-y divide-gray-100">
                                    {switchedOff.map(entry => (
                                        <EntryRow key={entry.tx.id} entry={entry} isPrivacyMode={isPrivacyMode} money={money} onToggle={toggle} showDate />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    {resolved.entries.length === 0 && (
                        <div className="p-8 text-center text-gray-400">No transactions in these dates yet.</div>
                    )}
                    {resolved.entries.length > 0 && visibleEntries.length === 0 && (
                        <div className="p-8 text-center text-gray-400">Nothing matches the search or filters.</div>
                    )}
                </div>
            </div>

            {isPickerOpen && (
                <TripTransactionPicker
                    trip={trip}
                    trips={trips}
                    transactions={transactions}
                    suggestions={suggestions}
                    isPrivacyMode={isPrivacyMode}
                    onAdd={add}
                    onClose={() => setIsPickerOpen(false)}
                />
            )}

            {isEditing && <TripFormModal
                title="Edit trip"
                submitLabel="Save"
                initial={{ name: trip.name, startDate: trip.startDate, endDate: trip.endDate, icon: trip.icon ?? null, budget: trip.budget ?? null }}
                autoIcon={v => autoTripIcon({ ...trip, name: v.name, startDate: v.startDate || trip.startDate, endDate: v.endDate || trip.endDate }, transactions)}
                onSubmit={saveDetails}
                onClose={() => setIsEditing(false)}
                onDelete={() => { setIsEditing(false); setIsConfirmingDelete(true); }}
            />}

            <ConfirmDialog
                isOpen={isConfirmingDelete}
                title={`Delete "${trip.name.trim()}"?`}
                description="The trip and its lists of added and switched-off transactions are removed. The transactions themselves stay in your data."
                confirmLabel="Delete trip"
                tone="danger"
                isBusy={isDeleting}
                onConfirm={confirmDelete}
                onCancel={() => setIsConfirmingDelete(false)}
            />
        </div>
    );
}

// Two across on a phone, with the icon dropped there to leave room for the number.
// Spending against the trip's budget: how much is left, what each remaining day may cost, and
// for a trip under way, where its pace so far would land.
function BudgetCard({ budget: b, money, onEdit }: { budget: BudgetStatus; money: (n: number) => string; onEdit: () => void }) {
    const over = b.left < 0;
    const overPace = b.projected !== null && b.projected > b.budget; // still inside it, but heading past it
    const fill = over ? 'bg-red-500' : b.share > 0.9 || overPace ? 'bg-amber-500' : 'bg-emerald-500';
    let line: string;
    if (over) line = `Over budget by ${money(-b.left)}`;
    else if (b.status === 'past') line = `Under budget by ${money(b.left)}`;
    else if (b.perDayLeft !== null) line = `${money(b.left)} left · about ${money(b.perDayLeft)}/day for the ${pluralDays(b.daysLeft)} ${b.status === 'upcoming' ? 'of the trip' : 'still ahead'}`;
    else line = `${money(b.left)} left`;
    const pace = b.projected !== null
        ? `At this pace the trip comes to ${money(b.projected)} — ${b.projected > b.budget ? `${money(b.projected - b.budget)} over` : `${money(b.budget - b.projected)} under`} the budget.`
        : null;
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Target className="w-4 h-4 text-emerald-600" />Budget</h3>
                <button onClick={onEdit} className="text-xs font-medium text-gray-400 hover:text-gray-700">Change</button>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-3 text-sm">
                <span className="text-gray-600"><span className="font-semibold text-gray-900 tabular-nums">{money(b.spent)}</span> of <span className="tabular-nums">{money(b.budget)}</span></span>
                <span className={cn("font-semibold tabular-nums", over ? "text-red-600" : "text-gray-500")}>{Math.round(b.share * 100)}%</span>
            </div>
            <div className="mt-2 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                <div className={cn("h-full rounded-full transition-all", fill)} style={{ width: `${Math.min(100, b.share * 100)}%` }} />
            </div>
            <p className={cn("mt-2 text-sm", over ? "text-red-600 font-medium" : "text-gray-700")}>{line}</p>
            {pace && <p className={cn("mt-0.5 text-xs", overPace && !over ? "text-amber-700" : "text-gray-500")}>{pace}</p>}
        </div>
    );
}

function Tile({ title, value, sub, icon }: { title: string; value: string; sub?: string; icon: React.ReactNode }) {
    return (
        <div className="bg-white p-3 md:p-5 rounded-xl shadow-sm border border-gray-100 flex items-start justify-between min-w-0">
            <div className="flex-1 min-w-0">
                <p className="text-xs md:text-sm font-medium text-gray-500 mb-1 truncate">{title}</p>
                <div className="text-lg md:text-2xl font-bold tabular-nums truncate text-gray-900">{value}</div>
                {sub && <p className="text-[11px] md:text-xs text-gray-400 mt-1 md:mt-1.5 leading-snug">{sub}</p>}
            </div>
            <div className="hidden md:block flex-shrink-0 ml-3">{icon}</div>
        </div>
    );
}

// "+111%" / "−40%" / "new" — how far a trip's daily figure is from home's.
function DeltaBadge({ now, before, plain = false }: { now: number; before: number; plain?: boolean }) {
    const pct = percentChange(now, before);
    const label = pct === null ? 'new' : `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}%`;
    const tone = pct === null || pct > 10 ? 'text-amber-700' : pct < -10 ? 'text-emerald-700' : 'text-gray-500';
    if (plain) return <span className={cn("tabular-nums text-xs font-semibold", tone)}>{label}</span>;
    return <span className={cn("ml-2 px-1.5 py-0.5 rounded-md bg-gray-50 border border-gray-100 tabular-nums text-xs font-semibold", tone)}>{label}</span>;
}

function SuggestionRow({ suggestion, money, onAdd, onDismiss }: {
    suggestion: TripSuggestion;
    money: (n: number) => string;
    onAdd: (tx: Transaction) => void;
    onDismiss: (tx: Transaction) => void;
}) {
    const { tx, daysBefore } = suggestion;
    const color = stringToColor(tx.category);
    const n = Math.abs(daysBefore);
    const when = `${n} day${n === 1 ? '' : 's'} ${daysBefore > 0 ? 'before' : 'after'}`;
    return (
        <div className="flex items-center gap-3 py-2">
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", color.bg, color.text)}>
                {React.createElement(getCategoryIcon(tx.category), { className: 'w-4 h-4' })}
            </div>
            <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">{getTransactionTitle(tx)}</div>
                {getTransactionNote(tx) && <div className="text-xs text-gray-600 truncate" title={getTransactionNote(tx)}>{getTransactionNote(tx)}</div>}
                <div className="text-xs text-gray-500 truncate">
                    {/* On phones the amount moves here, so the title keeps its room. */}
                    <span className="sm:hidden font-semibold text-gray-700 tabular-nums">{money(Math.abs(tx.amount))} · </span>
                    {tx.category} · {formatDate(tx.date)} · {when}
                </div>
            </div>
            <div className="hidden sm:block font-semibold text-gray-900 tabular-nums whitespace-nowrap">{money(Math.abs(tx.amount))}</div>
            <button
                onClick={() => onAdd(tx)}
                className="inline-flex items-center gap-1 p-2 sm:px-2.5 sm:py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors flex-shrink-0"
                aria-label={`Add ${getTransactionTitle(tx)} to the trip`}
            >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Add</span>
            </button>
            <button
                onClick={() => onDismiss(tx)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white transition-colors flex-shrink-0"
                title="Not part of this trip"
                aria-label={`Not part of this trip: ${getTransactionTitle(tx)}`}
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

function EntryRow({ entry, isPrivacyMode, money, onToggle, showDate = false, inBookedGroup = false }: {
    entry: TripEntry;
    isPrivacyMode: boolean;
    money: (n: number) => string;
    onToggle: (entry: TripEntry) => void;
    showDate?: boolean;       // inside a day's group the day is already in its heading
    inBookedGroup?: boolean;  // …and in the "Booked ahead" group so is the badge
}) {
    const { tx, state, added, beforeTrip } = entry;
    const counted = state === 'counted';
    const color = stringToColor(tx.category);
    const note = getTransactionNote(tx);
    return (
        <div
            role="checkbox"
            aria-checked={counted}
            tabIndex={0}
            onClick={() => onToggle(entry)}
            onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggle(entry); } }}
            className={cn("flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3 hover:bg-gray-50 transition-colors cursor-pointer focus:outline-none focus-visible:bg-emerald-50/50", !counted && "bg-gray-50/50")}
        >
            <div className={cn("w-5 h-5 rounded border flex items-center justify-center transition-all flex-shrink-0", counted ? "border-emerald-500 bg-emerald-500" : "border-gray-300 bg-white")}>
                {counted && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
            </div>
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", color.bg, color.text, !counted && "grayscale opacity-60")}>
                {React.createElement(getCategoryIcon(tx.category), { className: 'w-5 h-5' })}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("font-bold truncate", counted ? "text-gray-900" : "text-gray-500 line-through")}>{getTransactionTitle(tx)}</span>
                    {beforeTrip && !inBookedGroup && <Badge className="bg-blue-50 text-blue-700 border-blue-100">booked ahead</Badge>}
                    {added && !beforeTrip && <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100">added</Badge>}
                    {state === 'home-bill' && <Badge className="bg-gray-100 text-gray-500 border-gray-200">home bill</Badge>}
                </div>
                {note && (
                    <div className={cn("text-xs line-clamp-2 sm:line-clamp-1", counted ? "text-gray-600" : "text-gray-400")} title={note}>{note}</div>
                )}
                <div className="text-xs text-gray-500 truncate">
                    <span className="font-medium text-gray-600">{tx.category}</span>{showDate && ` · ${formatDate(tx.date)}`} · {tx.account}
                </div>
            </div>
            <div className="text-right whitespace-nowrap">
                <div className={cn("font-bold tabular-nums", counted ? "text-gray-900" : "text-gray-400 line-through")}>{money(Math.abs(tx.amount))}</div>
                {tx.originalCurrency && tx.originalAmount !== undefined && (
                    <div className={cn("text-xs tabular-nums mt-0.5", counted ? "text-gray-500" : "text-gray-300")}>
                        {isPrivacyMode ? '••••' : formatNative(Math.abs(tx.originalAmount), tx.originalCurrency)}
                    </div>
                )}
            </div>
        </div>
    );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
    return <span className={cn("shrink-0 px-1.5 py-px rounded-md border text-[10px] font-semibold", className)}>{children}</span>;
}
