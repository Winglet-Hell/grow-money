import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Handshake, Info, Pencil, Plus, ShoppingCart, Smartphone, TrendingDown } from 'lucide-react';
import type { ResalePurchaseEntry, Transaction } from '../types';
import { usePrivacy } from '../contexts/PrivacyContext';
import { useUserSettings } from '../contexts/UserSettingsContext';
import { buildResale, formatOwned, normalizeResaleEntries, purchaseCandidates, type DealSide, type OwnedItem, type SaleItem, type SoldItem } from '../lib/resale';
import { formatDayKey, todayKey } from '../lib/milestones';
import { dateKeyOf } from '../lib/periods';
import { formatNative, formatRub, formatRubSigned } from '../lib/tripFormat';
import { getCategoryColor, getCategoryIcon } from '../lib/categoryIcons';
import { cn } from '../lib/utils';
import { ResalePurchaseModal } from '../components/ResalePurchaseModal';
import { PhotoButton } from '../components/OperationPhotos';

interface ResalePageProps {
    transactions: Transaction[];
}

// Column templates: icon · item · bought · sold · owned · difference · a month · edit,
// and icon · item · bought · price · owned for what is still in use.
const SOLD_GRID = 'md:grid-cols-[2rem_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.55fr)_minmax(0,1fr)_minmax(0,0.75fr)_2rem]';
const OWNED_GRID = 'md:grid-cols-[2rem_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.6fr)]';

/** "8 Mar → 8 Oct 2026", or with both years when they differ. */
const formatSpan = (from: string, to: string) =>
    from.slice(0, 4) === to.slice(0, 4)
        ? `${formatDayKey(from).slice(0, -5)} → ${formatDayKey(to)}`
        : `${formatDayKey(from)} → ${formatDayKey(to)}`;

export function ResalePage({ transactions }: ResalePageProps) {
    const { isPrivacyMode } = usePrivacy();
    const { settings, updatePreferences, loading } = useUserSettings();
    const entries = useMemo(() => normalizeResaleEntries(settings.preferences.resale?.purchases), [settings.preferences.resale]);

    const today = todayKey();
    const summary = useMemo(() => buildResale(transactions, entries, today), [transactions, entries, today]);
    const statementStart = useMemo(() => transactions.reduce<string | null>((min, t) => {
        const day = dateKeyOf(t.date);
        return day && (!min || day < min) ? day : min;
    }, null), [transactions]);

    // The sale whose purchase is being typed in or picked.
    const [editing, setEditing] = useState<SaleItem | SoldItem | null>(null);
    const [showOwned, setShowOwned] = useState(true);
    const candidates = useMemo(() => {
        if (!editing) return [];
        const current = 'purchase' in editing && editing.purchase.source === 'picked' ? editing.purchase.tx?.id : undefined;
        return purchaseCandidates(transactions, summary, editing, current);
    }, [editing, transactions, summary]);

    const money = (n: number) => (isPrivacyMode ? '••••' : formatRub(Math.round(n)));
    const signed = (n: number) => (isPrivacyMode ? '••••' : formatRubSigned(n));
    const native = (side: DealSide) => (side.native ? (isPrivacyMode ? '••••' : formatNative(side.native.amount, side.native.currency)) : null);
    const percent = (share: number) => `${Math.round(share * 100)}%`;

    // Saving writes the whole preferences blob, so nothing here may save before it has loaded;
    // the buttons that lead to a save stay hidden until then.
    const save = (key: string, entry: ResalePurchaseEntry | null) => {
        const next = { ...entries };
        if (entry) next[key] = entry; else delete next[key];
        updatePreferences({ resale: { ...settings.preferences.resale, purchases: next } });
        setEditing(null);
    };
    const edit = (item: SaleItem | SoldItem) => { if (!loading) setEditing(item); };

    const { sold, unmatched, owned, totals } = summary;

    // ------------------------------------------------------------------ rows

    // A side of a deal in a table cell: rubles, what changed hands when it wasn't rubles, the day.
    const dealCell = (side: DealSide) => {
        const paidIn = native(side);
        return (
            <div className="hidden md:block text-right min-w-0">
                <div className="font-medium text-gray-900 tabular-nums whitespace-nowrap">{money(side.rub)}</div>
                {paidIn && <div className="text-xs text-gray-500 tabular-nums whitespace-nowrap">{paidIn}</div>}
                <div className="text-xs text-gray-400 tabular-nums whitespace-nowrap">{formatDayKey(side.day)}</div>
            </div>
        );
    };

    // Render helpers rather than nested components: a component defined inside render is a
    // new type every time, so React would remount every row.
    const renderSold = (s: SoldItem) => {
        const category = s.purchase.tx?.category ?? 'Resale';
        const Icon = getCategoryIcon(category);
        const color = getCategoryColor(category, s.purchase.tx ? 'expense' : 'income');
        const editable = s.purchase.source !== 'statement' && !loading;
        const gain = s.difference >= 0;
        const places = s.purchase.place || s.sale.place ? `${s.purchase.place || '—'} → ${s.sale.place || '—'}` : '';
        const kept = s.kept !== null ? Math.min(s.kept, 1) : null;

        return (
            <div
                key={`${s.key}:${s.sale.day}:${s.sale.tx?.id}`}
                role={editable ? 'button' : undefined}
                tabIndex={editable ? 0 : undefined}
                onClick={editable ? () => edit(s) : undefined}
                onKeyDown={editable ? e => { if (e.key === 'Enter') edit(s); } : undefined}
                className={cn(
                    "grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 md:px-6 py-3 border-b border-gray-100 last:border-0",
                    SOLD_GRID,
                    editable && "cursor-pointer transition-colors hover:bg-gray-50/70 focus:outline-none focus-visible:bg-emerald-50/50"
                )}
            >
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", color.bg, color.text)} aria-hidden>
                    <Icon className="w-4 h-4" />
                </div>

                {/* Item */}
                <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className={cn("font-medium truncate", s.name ? "text-gray-900" : "text-gray-400 italic")} title={s.name}>{s.name || 'No comment'}</span>
                        {/* A receipt or a box can be on either side of the deal. */}
                        <PhotoButton photos={[...(s.purchase.tx?.photos ?? []), ...(s.sale.tx?.photos ?? [])]} title={s.name || 'No comment'} />
                        {s.purchase.source !== 'statement' && (
                            <span
                                className="shrink-0 px-1.5 py-px rounded-md border border-gray-200 bg-gray-50 text-[10px] font-semibold uppercase tracking-wide text-gray-500"
                                title={s.purchase.source === 'manual'
                                    ? 'Bought before the statement; the price was typed in'
                                    : `Matched by hand to “${s.purchase.tx?.note.trim() || 'a purchase with no comment'}”`}
                            >
                                {s.purchase.source === 'manual' ? 'Typed in' : 'Picked'}
                            </span>
                        )}
                    </div>
                    <div className="hidden md:block text-xs text-gray-400 truncate" title={places}>{places}</div>
                    {/* On phones these lines carry the hidden columns: the dates, how long, and a month. */}
                    <div className="md:hidden text-xs text-gray-400 truncate tabular-nums">{formatSpan(s.purchase.day, s.sale.day)}</div>
                    <div className="md:hidden text-xs text-gray-400 truncate tabular-nums">{formatOwned(s.days)} · {signed(s.perMonth)}/mo</div>
                </div>

                {dealCell(s.purchase)}
                {dealCell(s.sale)}

                {/* Owned */}
                <div className="hidden md:block text-sm text-gray-600 tabular-nums whitespace-nowrap" title={`${s.days} day${s.days === 1 ? '' : 's'}`}>
                    {formatOwned(s.days)}
                </div>

                {/* Difference (+ a month, on phones) */}
                <div className="text-right min-w-0">
                    <div className={cn("font-semibold tabular-nums whitespace-nowrap", gain ? "text-emerald-600" : "text-amber-600")}>{signed(s.difference)}</div>
                    {kept !== null && (
                        <div className="flex items-center justify-end gap-2 mt-1">
                            <div className="hidden md:block h-1.5 w-14 rounded-full bg-amber-100 overflow-hidden" aria-hidden>
                                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${kept * 100}%` }} />
                            </div>
                            <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">kept {percent(s.kept!)}</span>
                        </div>
                    )}
                </div>

                {/* A month */}
                <div className="hidden md:block text-right text-sm tabular-nums whitespace-nowrap">
                    <span className={gain ? "text-emerald-600" : "text-gray-700"}>{signed(s.perMonth)}</span>
                </div>

                <div className="hidden md:flex justify-end">
                    {editable && (
                        <button
                            onClick={e => { e.stopPropagation(); edit(s); }}
                            className="p-1.5 text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                            title="Change the purchase"
                            aria-label={`Change the purchase of ${s.name || 'this item'}`}
                        >
                            <Pencil className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const renderUnmatched = (s: SaleItem) => {
        const Icon = getCategoryIcon('Resale');
        const color = getCategoryColor('Resale', 'income');
        const paidIn = native(s.sale);
        return (
            <div
                key={`${s.key}:${s.sale.day}:${s.sale.tx?.id}`}
                role={loading ? undefined : 'button'}
                tabIndex={loading ? undefined : 0}
                onClick={() => edit(s)}
                onKeyDown={e => { if (e.key === 'Enter') edit(s); }}
                className={cn(
                    "grid grid-cols-[2rem_minmax(0,1fr)_auto] md:grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-x-3 px-4 md:px-6 py-3 border-b border-gray-100 last:border-0",
                    !loading && "cursor-pointer transition-colors hover:bg-gray-50/70 focus:outline-none focus-visible:bg-emerald-50/50"
                )}
            >
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", color.bg, color.text)} aria-hidden>
                    <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className={cn("font-medium truncate", s.name ? "text-gray-900" : "text-gray-400 italic")} title={s.name}>{s.name || 'No comment'}</span>
                        <PhotoButton photos={s.sale.tx?.photos} title={s.name || 'No comment'} />
                    </div>
                    <div className="text-xs text-gray-400 truncate tabular-nums">
                        Sold {formatDayKey(s.sale.day)}{s.sale.place && ` · ${s.sale.place}`}
                    </div>
                </div>
                <div className="text-right">
                    <div className="font-medium text-gray-900 tabular-nums whitespace-nowrap">{money(s.sale.rub)}</div>
                    {paidIn && <div className="text-xs text-gray-400 tabular-nums whitespace-nowrap">{paidIn}</div>}
                </div>
                {!loading && (
                    <button
                        onClick={e => { e.stopPropagation(); edit(s); }}
                        className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-colors whitespace-nowrap"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Add purchase
                    </button>
                )}
            </div>
        );
    };

    const renderOwned = (o: OwnedItem) => {
        const category = o.purchase.tx?.category ?? '';
        const Icon = getCategoryIcon(category);
        const color = getCategoryColor(category, 'expense');
        const paidIn = native(o.purchase);
        return (
            <div key={o.id} className={cn("grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 md:px-6 py-2.5 border-b border-gray-100 last:border-0", OWNED_GRID)}>
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", color.bg, color.text)} aria-hidden>
                    <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className={cn("font-medium truncate", o.name ? "text-gray-900" : "text-gray-400 italic")} title={o.name}>{o.name || 'No comment'}</span>
                        <PhotoButton photos={o.purchase.tx?.photos} title={o.name || 'No comment'} />
                    </div>
                    <div className="text-xs text-gray-400 truncate tabular-nums">
                        <span className="md:hidden">{formatDayKey(o.purchase.day)}{o.purchase.place && ' · '}</span>
                        {o.purchase.place}
                    </div>
                </div>
                <div className="hidden md:block text-sm text-gray-600 tabular-nums whitespace-nowrap">{formatDayKey(o.purchase.day)}</div>
                <div className="text-right">
                    <div className="font-medium text-gray-900 tabular-nums whitespace-nowrap">{money(o.purchase.rub)}</div>
                    {paidIn && <div className="hidden md:block text-xs text-gray-400 tabular-nums whitespace-nowrap">{paidIn}</div>}
                    <div className="md:hidden text-xs text-gray-400 tabular-nums whitespace-nowrap">{formatOwned(o.days)}</div>
                </div>
                <div className="hidden md:block text-right text-sm text-gray-600 tabular-nums whitespace-nowrap" title={`${o.days} day${o.days === 1 ? '' : 's'}`}>
                    {formatOwned(o.days)}
                </div>
            </div>
        );
    };

    const headerCell = (label: string, className?: string) => (
        <div className={cn("text-[11px] font-semibold uppercase tracking-wider text-gray-500", className)}>{label}</div>
    );

    // ------------------------------------------------------------------ page

    const nothingSold = sold.length === 0 && unmatched.length === 0;

    return (
        <div className="space-y-6 enter-cascade">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">Resale</h2>
                <p className="text-gray-500">What your things cost to own: the price you paid against the price they sold for</p>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 enter-row">
                <SummaryCard
                    title="Paid"
                    value={sold.length ? money(totals.paid) : '—'}
                    sub={sold.length ? `for the ${sold.length === 1 ? 'thing' : `${sold.length} things`} you sold` : 'nothing sold yet'}
                    icon={<ShoppingCart className="w-9 h-9 text-blue-500" strokeWidth={1.5} />}
                />
                <SummaryCard
                    title="Sold for"
                    value={sold.length ? money(totals.got) : '—'}
                    sub={totals.kept !== null ? `got back ${percent(totals.kept)} of the price` : 'nothing sold yet'}
                    icon={<Handshake className="w-9 h-9 text-orange-400" strokeWidth={1.5} />}
                />
                <SummaryCard
                    title="Cost of owning"
                    value={sold.length ? signed(totals.difference) : '—'}
                    tone={sold.length ? (totals.difference >= 0 ? 'good' : 'cost') : 'default'}
                    sub={totals.perMonth !== null ? `${signed(totals.perMonth)} per month of use` : 'nothing sold yet'}
                    icon={<TrendingDown className="w-9 h-9 text-amber-500" strokeWidth={1.5} />}
                />
                <SummaryCard
                    title="Still in use"
                    value={owned.length ? money(summary.ownedTotal) : '—'}
                    sub={owned.length ? `${owned.length} gadget${owned.length === 1 ? '' : 's'} not sold` : 'no unsold gadgets'}
                    icon={<Smartphone className="w-9 h-9 text-purple-500" strokeWidth={1.5} />}
                />
            </div>

            {/* Sold */}
            <Section title="Sold" count={sold.length} hint="newest sale first">
                {sold.length > 0 && (
                    <div className={cn("hidden md:grid items-center gap-x-3 px-6 py-2.5 border-b border-gray-100", SOLD_GRID)}>
                        <div />
                        {headerCell('Item')}
                        {headerCell('Bought', 'text-right')}
                        {headerCell('Sold', 'text-right')}
                        {headerCell('Owned')}
                        {headerCell('Difference', 'text-right')}
                        {headerCell('A month', 'text-right')}
                        <div />
                    </div>
                )}
                {sold.map(renderSold)}
                {sold.length === 0 && (
                    <div className="py-10 flex flex-col items-center justify-center text-center px-6">
                        <Handshake className="w-10 h-10 mb-3 text-gray-300" />
                        <p className="font-medium text-gray-500">{nothingSold ? 'Nothing sold yet' : 'No sale has its purchase yet'}</p>
                        <p className="text-sm text-gray-400 max-w-md mt-1">
                            {nothingSold
                                ? 'Record a sale as income in the Resale category, with the same comment as on its purchase. It shows up here with what owning it cost.'
                                : 'Add the purchases below: type in what an older thing cost, or pick the row from your statement.'}
                        </p>
                    </div>
                )}
            </Section>

            {/* Sold without a purchase */}
            {unmatched.length > 0 && (
                <Section title="Purchase not found" count={unmatched.length} hint="no purchase with the same comment">
                    <p className="px-4 md:px-6 py-2.5 text-xs text-gray-500 bg-amber-50/50 border-b border-gray-100">
                        Bought before your statement starts{statementStart ? ` (${formatDayKey(statementStart)})` : ''}? Type in what it cost.
                        Under another comment? Pick it from the statement. Either way it moves up to the table.
                    </p>
                    {unmatched.map(renderUnmatched)}
                </Section>
            )}

            {/* Still owned */}
            {owned.length > 0 && (
                <Section
                    title="Still in use"
                    count={owned.length}
                    hint="electronics bought and not sold"
                    collapsed={!showOwned}
                    onToggle={() => setShowOwned(v => !v)}
                >
                    <div className={cn("hidden md:grid items-center gap-x-3 px-6 py-2.5 border-b border-gray-100", OWNED_GRID)}>
                        <div />
                        {headerCell('Item')}
                        {headerCell('Bought')}
                        {headerCell('Price', 'text-right')}
                        {headerCell('Owned', 'text-right')}
                    </div>
                    {owned.map(renderOwned)}
                </Section>
            )}

            <p className="text-xs text-gray-400 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                    A sale is income in the <em>Resale</em> category. Its purchase is the expense with the same comment,
                    whatever the capitals and word order, made on or before the day of the sale. Both are in rubles at their
                    own day’s rate, so a change in exchange rates between the two days is part of the difference. A month
                    of use divides the difference by the months you had the thing, counting at least one.
                </span>
            </p>

            {editing && (
                <ResalePurchaseModal
                    key={editing.key}
                    item={editing}
                    entry={entries[editing.key]}
                    candidates={candidates}
                    statementStart={statementStart}
                    isPrivacyMode={isPrivacyMode}
                    onSave={entry => save(editing.key, entry)}
                    onRemove={() => save(editing.key, null)}
                    onClose={() => setEditing(null)}
                />
            )}
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

function SummaryCard({ title, value, sub, icon, tone = 'default' }: {
    title: string; value: string; sub: string; icon: React.ReactNode; tone?: 'default' | 'good' | 'cost';
}) {
    return (
        <div className="bg-white p-4 md:p-5 rounded-xl shadow-sm border border-gray-100 flex items-start justify-between min-w-0">
            <div className="flex-1 min-w-0">
                <p className="text-xs md:text-sm font-medium text-gray-500 mb-1 truncate">{title}</p>
                <div className={cn(
                    "text-lg md:text-2xl font-bold tabular-nums truncate",
                    tone === 'good' ? "text-emerald-600" : tone === 'cost' ? "text-amber-600" : "text-gray-900"
                )}>
                    {value}
                </div>
                <p className="text-xs text-gray-400 mt-1 md:mt-1.5 leading-snug" title={sub}>{sub}</p>
            </div>
            <div className="hidden md:block flex-shrink-0 ml-3">{icon}</div>
        </div>
    );
}
