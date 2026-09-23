import React, { useMemo, useState } from 'react';
import {
    Repeat, CalendarClock, AlertTriangle, ChevronDown, ChevronRight, EyeOff, Eye,
    Sparkles, TrendingUp, TrendingDown, Wallet, Receipt,
} from 'lucide-react';
import type { Transaction } from '../types';
import { usePrivacy } from '../contexts/PrivacyContext';
import { useUserSettings } from '../contexts/UserSettingsContext';
import { cn, stringToColor, formatDate, ordinal } from '../lib/utils';
import { getCategoryIcon } from '../lib/categoryIcons';
import { formatCurrencyAmount } from '../lib/currencies';
import { summarizePeriod } from '../lib/periods';
import { detectRecurring, typicalDayOfMonth, CADENCE_LABEL, type RecurringSeries } from '../lib/recurring';

interface RecurringPageProps {
    transactions: Transaction[];
}

const rub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const DAY_MS = 86_400_000;

export function RecurringPage({ transactions }: RecurringPageProps) {
    const { isPrivacyMode } = usePrivacy();
    const { settings, updatePreferences } = useUserSettings();
    const hiddenIds = useMemo(() => settings.preferences.recurring?.hiddenIds ?? [], [settings.preferences.recurring]);

    const today = new Date();
    const summary = useMemo(() => detectRecurring(transactions, { hiddenIds, now: today }), [transactions, hiddenIds]); // eslint-disable-line react-hooks/exhaustive-deps
    const avgMonthlyExpenses = useMemo(() => summarizePeriod(transactions, { kind: 'all' }, today).avgMonthlyExpenses, [transactions]); // eslint-disable-line react-hooks/exhaustive-deps

    const [showEnded, setShowEnded] = useState(false);
    const [showHidden, setShowHidden] = useState(false);
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

    const money = (n: number) => (isPrivacyMode ? '••••' : rub.format(n));
    // Rubles read like the rest of the app ("4 845 ₽"); other currencies like the Wallets page ("THB 15,000").
    const amountIn = (n: number, currency: string) =>
        isPrivacyMode ? '••••' : currency === 'RUB' ? rub.format(n) : formatCurrencyAmount(n, currency);

    const todayDay = Math.round(Date.parse(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`) / DAY_MS);
    const daysUntil = (date: string) => Math.round(Date.parse(date) / DAY_MS) - todayDay;
    const relative = (date: string) => {
        const d = daysUntil(date);
        if (d === 0) return 'today';
        if (d === 1) return 'tomorrow';
        if (d === -1) return 'yesterday';
        if (d > 0) return `in ${d} days`;
        return `${-d} days ago`;
    };

    const setHidden = (ids: string[]) => updatePreferences({ recurring: { hiddenIds: ids } });
    const hide = (s: RecurringSeries) => setHidden([...hiddenIds, s.id]);
    const restore = (s: RecurringSeries) => setHidden(hiddenIds.filter(id => id !== s.id));
    const toggleExpanded = (id: string) => setExpanded(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const priceChanges = summary.active.filter(s => s.priceChange).length;
    const newOnes = summary.active.filter(s => s.isNew).length;
    const attention = summary.missed.length + priceChanges;
    const shareOfMonth = avgMonthlyExpenses > 0 ? summary.monthlyRub / avgMonthlyExpenses : 0;

    const dueThisMonth = summary.active.filter(s => {
        const d = daysUntil(s.nextDate);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate();
        return d >= 0 && d <= monthEnd;
    });

    // ------------------------------------------------------------------ rows

    // Render helpers rather than nested components: a component defined inside render is a
    // new type every time, so React would remount every row (and replay its animations).
    const renderRow = (s: RecurringSeries, tone: 'default' | 'missed' | 'ended' | 'hidden' = 'default') => {
        const Icon = getCategoryIcon(s.category);
        const color = stringToColor(s.category);
        const isOpen = expanded.has(s.id);
        const dom = typicalDayOfMonth(s);
        const next = daysUntil(s.nextDate);
        const change = s.priceChange ? (s.priceChange.to - s.priceChange.from) / s.priceChange.from : 0;

        return (
            <div key={s.id} className={cn(
                "border-b border-gray-100 last:border-0",
                tone === 'missed' && "bg-amber-50/40",
                tone !== 'default' && tone !== 'missed' && "opacity-70 hover:opacity-100 transition-opacity"
            )}>
                <div
                    className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-x-4 gap-y-1 items-center px-4 md:px-6 py-3 cursor-pointer hover:bg-gray-50/70 transition-colors"
                    onClick={() => toggleExpanded(s.id)}
                >
                    <div className={cn("p-2 rounded-lg shrink-0", color.bg, color.text)}>
                        <Icon className="w-4 h-4" />
                    </div>

                    <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium text-gray-900 truncate">{s.name}</span>
                            {s.isNew && tone === 'default' && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[10px] font-bold uppercase tracking-wider shrink-0">
                                    <Sparkles className="w-3 h-3" /> New
                                </span>
                            )}
                            {s.priceChange && (
                                <span
                                    title={`${amountIn(s.priceChange.from, s.currency)} → ${amountIn(s.priceChange.to, s.currency)}`}
                                    className={cn(
                                        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold shrink-0",
                                        change > 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"
                                    )}
                                >
                                    {change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                    {change > 0 ? '+' : ''}{Math.round(change * 100)}%
                                </span>
                            )}
                        </div>
                        <div className="text-xs text-gray-400 truncate">
                            {s.category} · {s.account}
                            <span className="md:hidden"> · {CADENCE_LABEL[s.cadence].toLowerCase()}</span>
                        </div>
                    </div>

                    {/* Amount (right column on phones) */}
                    <div className="text-right md:order-4">
                        <div className="font-semibold text-gray-900 whitespace-nowrap">{amountIn(s.amount, s.currency)}</div>
                        {s.currency !== 'RUB' && (
                            <div className="text-xs text-gray-400 whitespace-nowrap">≈ {money(s.amountRub)}</div>
                        )}
                    </div>

                    <div className="hidden md:block md:order-3 text-sm text-gray-600">
                        {CADENCE_LABEL[s.cadence]}
                        {dom && <div className="text-xs text-gray-400">around the {ordinal(dom)}</div>}
                    </div>

                    <div className="col-span-3 md:col-span-1 md:order-5 text-xs md:text-sm text-gray-600 pl-12 md:pl-0">
                        {tone === 'ended' ? (
                            <>
                                <span className="text-gray-500">Last {formatDate(s.lastDate)}</span>
                                <div className="text-xs text-gray-400">{s.count} charges since {formatDate(s.firstDate)}</div>
                            </>
                        ) : tone === 'missed' ? (
                            <>
                                <span className="text-amber-700 font-medium">Expected {formatDate(s.nextDate)}</span>
                                <div className="text-xs text-amber-600/80">nothing since {formatDate(s.lastDate)}</div>
                            </>
                        ) : (
                            <>
                                <span className={cn(next <= 3 && next >= 0 ? "text-emerald-700 font-medium" : "")}>
                                    Next {formatDate(s.nextDate)}
                                </span>
                                <div className="text-xs text-gray-400">{relative(s.nextDate)} · last {formatDate(s.lastDate)}</div>
                            </>
                        )}
                    </div>

                    <div className="hidden md:flex md:order-6 items-center gap-1 justify-end">
                        <button
                            onClick={(e) => { e.stopPropagation(); if (tone === 'hidden') restore(s); else hide(s); }}
                            title={tone === 'hidden' ? 'Show again' : 'Not recurring — hide'}
                            className="p-2 text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            {tone === 'hidden' ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                        {isOpen ? <ChevronDown className="w-4 h-4 text-gray-300" /> : <ChevronRight className="w-4 h-4 text-gray-300" />}
                    </div>
                </div>

                {isOpen && (
                    <div className="px-4 md:px-6 pb-4 pl-16 md:pl-[4.5rem] animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                    {s.count} charges · {Math.round(s.regularity * 100)}% on rhythm · every ~{Math.round(s.intervalDays)} days
                                </span>
                                <button
                                    onClick={() => { if (tone === 'hidden') restore(s); else hide(s); }}
                                    className="md:hidden text-xs font-medium text-gray-500 hover:text-gray-800 flex items-center gap-1"
                                >
                                    {tone === 'hidden' ? <><Eye className="w-3.5 h-3.5" /> Show again</> : <><EyeOff className="w-3.5 h-3.5" /> Not recurring</>}
                                </button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                                {[...s.charges].reverse().slice(0, 12).map(c => (
                                    <div key={c.date} className="flex justify-between gap-2 py-0.5 border-b border-gray-100/80 last:border-0">
                                        <span className="text-gray-500">{formatDate(c.date)}</span>
                                        <span
                                            className={cn("font-medium tabular-nums", c.comparable ? "text-gray-800" : "text-gray-400")}
                                            title={c.comparable ? undefined : `Paid in ${c.currency} — not compared with the ${s.currency} charges`}
                                        >
                                            {amountIn(c.amount, c.currency)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            {s.charges.length > 12 && (
                                <div className="text-[11px] text-gray-400 mt-2">…and {s.charges.length - 12} earlier</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // ------------------------------------------------------------------ page

    if (summary.series.length === 0 && summary.hidden.length === 0) {
        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Header dataEnd={summary.dataEnd} />
                <div className="py-16 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-3xl text-center px-6">
                    <Repeat className="w-12 h-12 mb-4 opacity-50" />
                    <p className="text-lg font-medium text-gray-500">No rhythm found yet</p>
                    <p className="text-sm max-w-md">
                        A recurring payment needs at least three charges with the same tag or note, roughly the same
                        amount, spaced a week, a month, a quarter or a year apart.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Header dataEnd={summary.dataEnd} />

            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <InfoCard
                    title="Monthly cost"
                    value={money(summary.monthlyRub)}
                    sub={`${summary.active.length} active${avgMonthlyExpenses > 0 ? ` · ${Math.round(shareOfMonth * 100)}% of an average month` : ''}`}
                    icon={<Repeat className="w-10 h-10 text-violet-500" strokeWidth={1.5} />}
                />
                <InfoCard
                    title="Due by month end"
                    value={money(summary.dueThisMonthRub)}
                    sub={dueThisMonth.length
                        ? dueThisMonth.slice(0, 2).map(s => `${s.name} ${formatDate(s.nextDate).slice(0, 5)}`).join(' · ') + (dueThisMonth.length > 2 ? ` +${dueThisMonth.length - 2}` : '')
                        : 'Nothing else expected this month'}
                    icon={<CalendarClock className="w-10 h-10 text-emerald-500" strokeWidth={1.5} />}
                />
                <InfoCard
                    title="Next 30 days"
                    value={money(summary.upcoming.reduce((sum, s) => sum + s.amountRub, 0))}
                    sub={`${summary.upcoming.length} charge${summary.upcoming.length === 1 ? '' : 's'} expected`}
                    icon={<Receipt className="w-10 h-10 text-blue-500" strokeWidth={1.5} />}
                />
                <InfoCard
                    title="Needs a look"
                    value={String(attention)}
                    sub={[
                        summary.missed.length ? `${summary.missed.length} missed` : null,
                        priceChanges ? `${priceChanges} price change${priceChanges === 1 ? '' : 's'}` : null,
                        newOnes ? `${newOnes} new` : null,
                    ].filter(Boolean).join(' · ') || 'All quiet'}
                    icon={<AlertTriangle className={cn("w-10 h-10", attention ? "text-amber-500" : "text-gray-300")} strokeWidth={1.5} />}
                    tone={attention ? 'warn' : 'default'}
                />
            </div>

            {summary.missed.length > 0 && (
                <Section title="Expected but not seen" count={summary.missed.length} hint="a charge is overdue — cancelled, or the export is older than it">
                    {summary.missed.map(s => renderRow(s, 'missed'))}
                </Section>
            )}

            <Section title="Active" count={summary.active.length} hint="sorted by monthly cost">
                {summary.active.length === 0
                    ? <p className="px-6 py-8 text-sm text-gray-400 text-center">Nothing active right now.</p>
                    : summary.active.map(s => renderRow(s))}
            </Section>

            {summary.ended.length > 0 && (
                <Section title="Ended" count={summary.ended.length} hint="no charge for two cycles" collapsed={!showEnded} onToggle={() => setShowEnded(v => !v)}>
                    {summary.ended.map(s => renderRow(s, 'ended'))}
                </Section>
            )}

            {summary.hidden.length > 0 && (
                <Section title="Hidden" count={summary.hidden.length} hint="marked as not recurring" collapsed={!showHidden} onToggle={() => setShowHidden(v => !v)}>
                    {summary.hidden.map(s => renderRow(s, 'hidden'))}
                </Section>
            )}

            <p className="text-xs text-gray-400 flex items-start gap-2">
                <Wallet className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                    Found by rhythm, not by a flag in the export: the same tag or note in the same category, charged at a
                    steady interval for a steady amount (compared in its own currency). Everything in your
                    <em> Subscriptions</em> category is kept even when the rhythm is loose. Groceries and cafés drop out on
                    purpose — their amounts wander.
                </span>
            </p>
        </div>
    );
}

function Section({ title, count, hint, children, collapsed, onToggle }: {
    title: string; count: number; hint?: string; children: React.ReactNode; collapsed?: boolean; onToggle?: () => void;
}) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <button
                type="button"
                onClick={onToggle}
                disabled={!onToggle}
                className={cn("w-full flex items-center justify-between gap-3 px-4 md:px-6 py-4 text-left", onToggle && "hover:bg-gray-50/70 transition-colors")}
            >
                <div className="flex items-baseline gap-2 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
                    <span className="text-sm text-gray-400">{count}</span>
                    {hint && <span className="text-xs text-gray-400 truncate hidden sm:inline">· {hint}</span>}
                </div>
                {onToggle && (collapsed ? <ChevronRight className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />)}
            </button>
            {!collapsed && <div className="border-t border-gray-100">{children}</div>}
        </div>
    );
}

function Header({ dataEnd }: { dataEnd: string | null }) {
    return (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">Recurring</h2>
                <p className="text-gray-500">Subscriptions, rent and bills found by their rhythm</p>
            </div>
            {dataEnd && (
                <div className="px-3 py-1 bg-gray-100 rounded-lg text-xs md:text-sm font-medium text-gray-600 flex items-center gap-2" title="Statuses are judged against the newest transaction, not today's date">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Data through {formatDate(dataEnd)}
                </div>
            )}
        </div>
    );
}

function InfoCard({ title, value, sub, icon, tone = 'default' }: { title: string; value: string; sub?: string; icon: React.ReactNode; tone?: 'default' | 'warn' }) {
    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-start justify-between transition-all hover:shadow-md">
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-500 mb-1 truncate">{title}</p>
                <h3 className={cn("text-2xl font-bold", tone === 'warn' ? "text-amber-600" : "text-gray-900")}>{value}</h3>
                {sub && <p className="text-xs text-gray-400 mt-2 truncate" title={sub}>{sub}</p>}
            </div>
            <div className="flex-shrink-0 ml-4">{icon}</div>
        </div>
    );
}
