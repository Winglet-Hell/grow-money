import React, { useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Info, Milestone as MilestoneIcon, Pencil, Plus } from 'lucide-react';
import type { Milestone, MilestoneKind, Transaction } from '../types';
import { usePrivacy } from '../contexts/PrivacyContext';
import { useUserSettings } from '../contexts/UserSettingsContext';
import { cn, stringToColor } from '../lib/utils';
import { getCategoryIcon } from '../lib/categoryIcons';
import { dateKeyOf, formatDelta } from '../lib/periods';
import {
    DAYS_PER_MONTH, KIND_ICONS, MILESTONE_KINDS, SHORT_CHAPTER_DAYS, SIDE_COLORS,
    addDays, buildChapters, categoryChanges, chapterTitle, compareChapters, defaultPair, formatDayKey as formatDay, kindLabel,
    monthlyFigures, monthlySeries, normalizeMilestones, prepareFlows, sortMilestones,
    type CategoryChange, type Chapter, type CompareWindow, type Comparison, type FlowSet, type RangeStats,
} from '../lib/milestones';
import { MilestoneTimeline } from '../components/MilestoneTimeline';
import { MilestoneModal } from '../components/MilestoneModal';
import { CategoryChangeModal } from '../components/CategoryChangeModal';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface MilestonesPageProps {
    transactions: Transaction[];
}

// What the comparison shows: the two sides of one milestone, or any two chapters (by key,
// so a pick survives edits elsewhere). `last` is the chapter picked most recently — the
// next pick replaces the other one.
type Selection =
    | { type: 'around'; cut: string }
    | { type: 'pair'; a: string; b: string; last: string };

type Side = 'a' | 'b';

const WINDOWS: { id: CompareWindow; label: string }[] = [
    { id: 'chapter', label: 'Whole chapters' },
    { id: 3, label: '3 months' },
    { id: 6, label: '6 months' },
    { id: 12, label: '1 year' },
];

const rub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const plain = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const monthFormat = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const utcDate = (key: string) => new Date(`${key}T00:00:00Z`);
const formatMonth = (key: string) => monthFormat.format(utcDate(key));
const quoted = (text: string) => `“${text}”`;

/** "18 days", "5.3 mo", "11 mo", "2.4 yr" */
function formatLength(days: number): string {
    if (days < 45) return `${days} day${days === 1 ? '' : 's'}`;
    const months = days / DAYS_PER_MONTH;
    if (months < 24) return `${months < 10 ? months.toFixed(1).replace(/\.0$/, '') : Math.round(months)} mo`;
    return `${(months / 12).toFixed(1).replace(/\.0$/, '')} yr`;
}

const signed = (n: number, text: string) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${text}`;

function resolvePair(selection: Selection | null, chapters: Chapter[]): [number, number] | null {
    const indexOf = (key: string) => chapters.findIndex(c => c.key === key);
    if (selection?.type === 'around') {
        const i = indexOf(selection.cut);
        if (i > 0 && chapters[i].stats && chapters[i - 1].stats) return [i - 1, i];
    } else if (selection?.type === 'pair') {
        const a = indexOf(selection.a);
        const b = indexOf(selection.b);
        if (a >= 0 && b >= 0 && a !== b && chapters[a].stats && chapters[b].stats) return a < b ? [a, b] : [b, a];
    }
    return defaultPair(chapters);
}

export function MilestonesPage({ transactions }: MilestonesPageProps) {
    const { isPrivacyMode } = usePrivacy();
    const { settings, updatePreferences, loading } = useUserSettings();
    const milestones = useMemo(() => normalizeMilestones(settings.preferences.milestones), [settings.preferences.milestones]);

    const [cutKindChoice, setCutKind] = useState<MilestoneKind | 'all'>('all');
    const [excludePlanned, setExcludePlanned] = useState(false);
    const [compareWindow, setCompareWindow] = useState<CompareWindow>('chapter');
    // A milestone flag on the Trends charts links here with the milestone to open on.
    const location = useLocation();
    const [selection, setSelection] = useState<Selection | null>(() => {
        const focusMilestone = (location.state as { focusMilestone?: string } | null)?.focusMilestone;
        return focusMilestone ? { type: 'around', cut: focusMilestone } : null;
    });
    // The milestone being edited, or a new one (optionally starting on a given day).
    const [editing, setEditing] = useState<{ milestone: Milestone | null; initialDate?: string } | null>(null);
    const [detail, setDetail] = useState<{ type: 'expense' | 'income'; category: string } | null>(null);
    const [toDelete, setToDelete] = useState<Milestone | null>(null);
    const compareRef = useRef<HTMLDivElement>(null);

    const kindsPresent = MILESTONE_KINDS.filter(k => milestones.some(m => m.kind === k.id));
    // A kind whose last milestone was deleted falls back to cutting at every milestone.
    const cutKind = cutKindChoice !== 'all' && kindsPresent.some(k => k.id === cutKindChoice) ? cutKindChoice : 'all';
    const cuts = (m: Milestone) => cutKind === 'all' || m.kind === cutKind;

    const flows = useMemo(() => prepareFlows(transactions, { excludePlanned }), [transactions, excludePlanned]);
    const series = useMemo(() => monthlySeries(flows), [flows]);
    const chapters = useMemo(() => buildChapters(milestones, flows, cutKind), [milestones, flows, cutKind]);

    const pair = resolvePair(selection, chapters);
    const comparison = pair ? compareChapters(flows, chapters[pair[0]], chapters[pair[1]], compareWindow) : null;
    const sideOf = (c: Chapter): Side | null => (pair?.[0] === c.index ? 'a' : pair?.[1] === c.index ? 'b' : null);

    const money = (n: number) => (isPrivacyMode ? '••••' : rub.format(Math.round(n)));

    // ------------------------------------------------------------------ actions

    const save = (next: Milestone[]) => updatePreferences({ milestones: sortMilestones(next) });

    // Show the before and after of a milestone; one that doesn't cut chapters in the current
    // view brings back the view where every milestone does.
    const focus = (m: Milestone) => {
        if (!cuts(m)) setCutKind('all');
        setSelection({ type: 'around', cut: m.date });
    };

    const handleSave = (m: Milestone) => {
        save([...milestones.filter(x => x.id !== m.id), m]);
        setEditing(null);
        focus(m);
    };

    const confirmDelete = () => {
        if (!toDelete) return;
        save(milestones.filter(x => x.id !== toDelete.id));
        setToDelete(null);
        setEditing(null);
    };

    // Side by side on wide screens; stacked, the comparison sits above the list, out of view.
    const scrollToComparison = () => {
        if (window.matchMedia('(min-width: 1024px)').matches) return;
        requestAnimationFrame(() => compareRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };

    const pickChapter = (c: Chapter) => {
        if (!c.stats || !pair || c.index === pair[0] || c.index === pair[1]) return;
        const shown = [chapters[pair[0]].key, chapters[pair[1]].key];
        const keep = selection?.type === 'pair' && shown.includes(selection.last) ? selection.last : shown[1];
        setSelection({ type: 'pair', a: keep, b: c.key, last: c.key });
        scrollToComparison();
    };

    // ------------------------------------------------------------------ page

    const header = (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">Milestones</h2>
                <p className="text-gray-500">Chapters of your life, and how money changed between them</p>
            </div>
            {/* Saving writes the whole preferences blob, so a save before it has loaded would
                replace everything else in it (Paycheck, hidden recurring…) with defaults. */}
            {!loading && (
                <button
                    onClick={() => setEditing({ milestone: null })}
                    className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm font-medium"
                >
                    <Plus className="w-4 h-4" />
                    Add milestone
                </button>
            )}
        </div>
    );

    const modals = (
        <>
            {editing && (
                <MilestoneModal
                    key={editing.milestone?.id ?? 'new'}
                    milestone={editing.milestone}
                    initialDate={editing.initialDate}
                    statement={{ first: flows.first, last: flows.last }}
                    onSave={handleSave}
                    onDelete={setToDelete}
                    // Escape reaches both dialogs; while the delete question is up it only closes that.
                    onClose={() => { if (!toDelete) setEditing(null); }}
                />
            )}
            {detail && comparison && pair && (
                <CategoryChangeModal
                    category={detail.category}
                    sides={(['b', 'a'] as const).map(side => {
                        const range = comparison[side];
                        return {
                            side,
                            title: chapterTitle(chapters[pair[side === 'a' ? 0 : 1]]),
                            range,
                            transactions: transactions.filter(t => {
                                if (t.type !== detail.type || (t.category || 'Uncategorized') !== detail.category) return false;
                                const day = dateKeyOf(t.date);
                                return day !== null && day >= range.from && day <= range.to;
                            }),
                        };
                    })}
                    isPrivacyMode={isPrivacyMode}
                    onClose={() => setDetail(null)}
                />
            )}
            <ConfirmDialog
                isOpen={!!toDelete}
                title="Delete this milestone?"
                description={toDelete ? `${quoted(toDelete.title)}, ${formatDay(toDelete.date)}. The chapters on either side of it merge into one.` : undefined}
                confirmLabel="Delete"
                tone="danger"
                onConfirm={confirmDelete}
                onCancel={() => setToDelete(null)}
            />
        </>
    );

    if (milestones.length === 0) {
        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {header}
                {loading ? (
                    <div className="py-24 flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
                    </div>
                ) : (
                    <div className="py-16 flex flex-col items-center justify-center text-center border-2 border-dashed border-gray-200 rounded-3xl px-6">
                        <MilestoneIcon className="w-12 h-12 mb-4 text-gray-300" />
                        <p className="text-lg font-medium text-gray-600">Mark your first milestone</p>
                        <p className="text-sm text-gray-400 max-w-md mt-1">
                            A move, a new job, a child, a car. Add the day it happened, and your history splits into
                            chapters you can hold side by side: what you earned, spent and saved before and after.
                        </p>
                        <button
                            onClick={() => setEditing({ milestone: null })}
                            className="mt-6 flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm font-medium"
                        >
                            <Plus className="w-4 h-4" />
                            Add milestone
                        </button>
                    </div>
                )}
                {modals}
            </div>
        );
    }

    const lastMonth = series.length ? series[series.length - 1].key : null;
    const offChart = series.length
        ? milestones.filter(m => m.date < `${series[0].key}-01` || (lastMonth !== null && m.date.slice(0, 7) > lastMonth))
        : milestones;

    const cutOptions: { id: MilestoneKind | 'all'; label: string }[] = [
        { id: 'all', label: 'Every milestone' },
        ...kindsPresent.map(k => ({ id: k.id, label: k.label })),
    ];

    // The list reads like the timeline: each chapter, with the milestone that opens it above.
    const listItems: React.ReactNode[] = [];
    for (const c of chapters) {
        if (c.index === 0 && !c.stats) continue; // nothing is known from before the first milestone
        for (const m of c.opener) {
            listItems.push(
                <MilestoneRow
                    key={`m-${m.id}`}
                    milestone={m}
                    active={comparison?.around === m.date}
                    onFocus={() => { focus(m); scrollToComparison(); }}
                    onEdit={() => setEditing({ milestone: m })}
                />
            );
        }
        const inside = cutKind === 'all' ? [] : milestones.filter(m =>
            !cuts(m) && (c.start === null || m.date >= c.start) && (c.end === null || m.date < c.end));
        listItems.push(
            <ChapterRow
                key={`c-${c.key}`}
                chapter={c}
                previous={c.index > 0 ? chapters[c.index - 1] : null}
                side={sideOf(c)}
                inside={inside}
                flows={flows}
                money={money}
                onPick={() => pickChapter(c)}
                onEditMilestone={m => setEditing({ milestone: m })}
                onAddOpening={c.index === 0 && flows.first ? () => setEditing({ milestone: null, initialDate: flows.first! }) : undefined}
            />
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {header}

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {kindsPresent.length >= 2 ? (
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm text-gray-500 whitespace-nowrap">Chapters by</span>
                        <div className="flex bg-gray-100 p-1 rounded-lg overflow-x-auto scrollbar-hide">
                            {cutOptions.map(option => (
                                <button
                                    key={option.id}
                                    onClick={() => setCutKind(option.id)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all",
                                        cutKind === option.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                                    )}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : <span className="hidden md:block" />}
                <label
                    className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none"
                    title="Rent, flights and hotels, tech, visas and insurance — big payments that land on a few days"
                >
                    <input
                        type="checkbox"
                        checked={excludePlanned}
                        onChange={e => setExcludePlanned(e.target.checked)}
                        className="w-4 h-4 accent-emerald-600"
                    />
                    Leave out big planned payments
                </label>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Timeline</h3>
                    <span className="text-xs text-gray-400">Click a milestone to see before and after</span>
                </div>
                {series.length > 0 && (
                    <MilestoneTimeline
                        series={series}
                        milestones={milestones}
                        cutKind={cutKind}
                        ranges={comparison ? { a: comparison.a, b: comparison.b } : null}
                        activeCut={comparison?.around ?? null}
                        onMilestoneClick={focus}
                        isPrivacyMode={isPrivacyMode}
                    />
                )}
                {offChart.length > 0 && flows.first && flows.last && (
                    <p className="mt-3 text-xs text-gray-400">
                        {offChart.length === 1 ? '1 milestone falls' : `${offChart.length} milestones fall`} outside your statement
                        ({formatMonth(flows.first)} – {formatMonth(flows.last)}), so {offChart.length === 1 ? "it's" : "they're"} only in the list below.
                    </p>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6 items-start">
                <div className="order-2 lg:order-1 bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
                        <h3 className="text-lg font-semibold text-gray-900">Chapters</h3>
                        <span className="text-xs text-gray-400">Pick any two to compare</span>
                    </div>
                    <div className="relative">
                        <span className="absolute left-[15px] top-4 bottom-4 w-px bg-gray-200" aria-hidden="true" />
                        <ol className="relative">{listItems}</ol>
                    </div>
                </div>

                <div ref={compareRef} className="order-1 lg:order-2 bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6 scroll-mt-24">
                    {comparison && pair ? (
                        <ComparisonView
                            a={chapters[pair[0]]}
                            b={chapters[pair[1]]}
                            comparison={comparison}
                            flows={flows}
                            compareWindow={compareWindow}
                            onWindowChange={setCompareWindow}
                            excludePlanned={excludePlanned}
                            isPrivacyMode={isPrivacyMode}
                            money={money}
                            onOpenCategory={(type, category) => setDetail({ type, category })}
                        />
                    ) : (
                        <div className="py-10 text-center">
                            <p className="font-medium text-gray-600">Nothing to compare yet</p>
                            <p className="text-sm text-gray-400 max-w-sm mx-auto mt-1">
                                A milestone splits the time your statement covers
                                {flows.first && flows.last ? ` (${formatMonth(flows.first)} – ${formatMonth(flows.last)})` : ''} into
                                a before and an after. Add one that falls inside it.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {modals}
        </div>
    );
}

// ------------------------------------------------------------------ chapter list

function MilestoneRow({ milestone, active, onFocus, onEdit }: {
    milestone: Milestone; active: boolean; onFocus: () => void; onEdit: () => void;
}) {
    const Icon = KIND_ICONS[milestone.kind];
    return (
        <li className="relative flex items-start gap-3 py-2">
            <span
                className={cn(
                    "relative z-10 flex-shrink-0 w-8 h-8 rounded-full ring-4 ring-white flex items-center justify-center transition-colors",
                    active ? "bg-gray-900 text-white" : "bg-emerald-50 text-emerald-600"
                )}
            >
                <Icon className="w-4 h-4" />
            </span>
            <button type="button" onClick={onFocus} className="group flex-1 min-w-0 text-left pt-0.5">
                <span className="block text-sm font-semibold text-gray-900 truncate group-hover:text-emerald-700 transition-colors">
                    {milestone.title}
                </span>
                <span className="block text-xs text-gray-400">
                    {formatDay(milestone.date)} · {kindLabel(milestone.kind)}
                </span>
                {milestone.note && <span className="block text-xs text-gray-500 mt-0.5 line-clamp-2">{milestone.note}</span>}
            </button>
            <button
                type="button"
                onClick={onEdit}
                aria-label={`Edit ${milestone.title}`}
                className="p-2 -mr-2 text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
                <Pencil className="w-4 h-4" />
            </button>
        </li>
    );
}

function ChapterRow({ chapter: c, previous, side, inside, flows, money, onPick, onEditMilestone, onAddOpening }: {
    chapter: Chapter;
    previous: Chapter | null;
    side: Side | null;
    inside: Milestone[];                  // milestones within it that don't cut chapters in this view
    flows: FlowSet;
    money: (n: number) => string;
    onPick: () => void;
    onEditMilestone: (m: Milestone) => void;
    onAddOpening?: () => void;           // the first chapter has no milestone to name it yet
}) {
    const figures = c.stats ? monthlyFigures(c.stats) : null;
    const change = figures && previous?.stats ? formatDelta(figures.expenses, monthlyFigures(previous.stats).expenses) : null;

    // The chapter's own dates; the length after them is what the statement covers of it.
    const startLabel = c.start ? formatMonth(c.start) : c.stats ? formatMonth(c.stats.from) : '…';
    const endLabel = c.end ? formatMonth(addDays(c.end, -1)) : c.stats ? 'now' : null;
    const span = endLabel === null ? `from ${startLabel}` : startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;

    const emptyReason = c.stats ? null
        : c.end && flows.first && c.end <= flows.first ? 'Before your statement starts'
            : c.start && flows.last && c.start > flows.last ? 'Starts after your latest data'
                : 'No data';

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPick();
        }
    };

    return (
        <li className="relative pl-11 py-1.5">
            <div
                role={c.stats ? 'button' : undefined}
                tabIndex={c.stats ? 0 : undefined}
                aria-pressed={c.stats ? side !== null : undefined}
                onClick={c.stats ? onPick : undefined}
                onKeyDown={c.stats ? onKeyDown : undefined}
                className={cn(
                    "rounded-xl border px-4 py-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                    side === 'a' ? "border-sky-300 bg-sky-50/60"
                        : side === 'b' ? "border-violet-300 bg-violet-50/60"
                            : c.stats ? "border-gray-100 bg-gray-50/60 hover:border-gray-200 hover:bg-gray-50 cursor-pointer"
                                : "border-dashed border-gray-200"
                )}
            >
                <div className="flex items-start gap-2 min-w-0">
                    {side && (
                        <span
                            className="flex-shrink-0 w-5 h-5 mt-px rounded-md text-[11px] font-bold flex items-center justify-center text-white"
                            style={{ backgroundColor: SIDE_COLORS[side].bar }}
                        >
                            {side.toUpperCase()}
                        </span>
                    )}
                    <span className={cn("min-w-0 font-semibold leading-snug break-words", c.stats ? "text-gray-900" : "text-gray-400")}>{chapterTitle(c)}</span>
                    {c.ongoing && <Tag className="bg-emerald-50 text-emerald-700">so far</Tag>}
                    {c.stats && c.stats.days < SHORT_CHAPTER_DAYS && <Tag className="bg-amber-50 text-amber-700">short</Tag>}
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 mt-0.5 text-xs">
                    <span className="text-gray-400 min-w-0">
                        <span className="whitespace-nowrap">{span}</span>
                        {c.stats && (
                            <span className="whitespace-nowrap">
                                {' · '}{formatLength(c.stats.days)}{c.clippedStart && ' of it in your statement'}
                            </span>
                        )}
                    </span>
                    {change && (
                        <span
                            className={cn(
                                "flex-shrink-0 font-medium whitespace-nowrap",
                                change.startsWith('+') ? "text-rose-600" : change.startsWith('−') ? "text-emerald-600" : "text-gray-400"
                            )}
                            title="Spending per month, against the chapter before"
                        >
                            spending {change}
                        </span>
                    )}
                </div>

                {figures ? (
                    <div className="grid grid-cols-3 gap-2 mt-2.5">
                        <ChapterStat label="Spent / mo" value={money(figures.expenses)} />
                        <ChapterStat label="Earned / mo" value={money(figures.income)} />
                        <ChapterStat
                            label="Saved"
                            value={figures.savingsRate === null ? '—' : `${Math.round(figures.savingsRate * 100)}%`}
                            sub="of income"
                        />
                    </div>
                ) : (
                    <div className="text-xs text-gray-400 mt-1">{emptyReason}</div>
                )}

                {onAddOpening && (
                    <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onAddOpening(); }}
                        className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Name it: add the milestone it began with
                    </button>
                )}

                {inside.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {inside.map(m => {
                            const Icon = KIND_ICONS[m.kind];
                            return (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={e => { e.stopPropagation(); onEditMilestone(m); }}
                                    title={`Edit ${quoted(m.title)}`}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-gray-200 text-[11px] text-gray-500 hover:text-gray-800 hover:border-gray-300 transition-colors"
                                >
                                    <Icon className="w-3 h-3" />
                                    {m.title} · {formatMonth(m.date)}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </li>
    );
}

function ChapterStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="min-w-0">
            <div className="text-[11px] font-medium text-gray-400 truncate">{label}</div>
            <div className="text-sm font-semibold text-gray-900 tabular-nums truncate">{value}</div>
            {sub && <div className="text-[11px] text-gray-400 truncate">{sub}</div>}
        </div>
    );
}

function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
    return <span className={cn("flex-shrink-0 mt-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider", className)}>{children}</span>;
}

// ------------------------------------------------------------------ comparison

function ComparisonView({ a, b, comparison, flows, compareWindow, onWindowChange, excludePlanned, isPrivacyMode, money, onOpenCategory }: {
    a: Chapter;
    b: Chapter;
    comparison: Comparison;
    flows: FlowSet;
    compareWindow: CompareWindow;
    onWindowChange: (w: CompareWindow) => void;
    excludePlanned: boolean;
    isPrivacyMode: boolean;
    money: (n: number) => string;
    onOpenCategory: (type: 'expense' | 'income', category: string) => void;
}) {
    const fa = monthlyFigures(comparison.a);
    const fb = monthlyFigures(comparison.b);
    const titleA = chapterTitle(a);
    const titleB = chapterTitle(b);
    const title = comparison.around ? `Before and after ${quoted(titleB)}` : `${quoted(titleA)} vs ${quoted(titleB)}`;

    const spending = categoryChanges(comparison.a.expenseByCategory, comparison.a.days, comparison.b.expenseByCategory, comparison.b.days);
    const income = categoryChanges(comparison.a.incomeByCategory, comparison.a.days, comparison.b.incomeByCategory, comparison.b.days);

    const rateA = fa.savingsRate === null ? null : Math.round(fa.savingsRate * 100);
    const rateB = fb.savingsRate === null ? null : Math.round(fb.savingsRate * 100);
    const tone = (delta: number, upIsGood: boolean) => (Math.round(delta) === 0 ? null : (delta > 0) === upIsGood);

    const notes: string[] = [];
    for (const [side, range, chapter] of [['A', comparison.a, a], ['B', comparison.b, b]] as const) {
        if (range.days < SHORT_CHAPTER_DAYS) {
            notes.push(`${side} covers only ${formatLength(range.days)}, so its monthly figures are rough — one big payment moves them a lot.`);
        }
        if (chapter.clippedStart && range.from === flows.first) {
            notes.push(`${quoted(chapterTitle(chapter))} began before your statement, so only its part from ${formatMonth(range.from)} is measured.`);
        }
    }
    if (b.ongoing && flows.last && comparison.b.to === flows.last) {
        notes.push(`${quoted(titleB)} is still going: figures so far, through ${formatDay(flows.last)}.`);
    }
    if (excludePlanned) notes.push('Rent, flights and hotels, tech, visas and insurance are left out.');

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3">
                <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 leading-snug">{title}</h3>
                    <div className="mt-1.5 space-y-0.5">
                        <RangeLine side="a" range={comparison.a} />
                        <RangeLine side="b" range={comparison.b} />
                    </div>
                </div>
                {comparison.around && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0">
                        <span className="text-xs text-gray-500 whitespace-nowrap">Each side</span>
                        <div className="flex bg-gray-100 p-1 rounded-lg overflow-x-auto scrollbar-hide">
                            {WINDOWS.map(w => (
                                <button
                                    key={w.id}
                                    onClick={() => onWindowChange(w.id)}
                                    className={cn(
                                        "px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all",
                                        compareWindow === w.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                                    )}
                                >
                                    {w.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <Figure
                    label="Earned a month"
                    value={money(fb.income)}
                    was={money(fa.income)}
                    delta={formatDelta(fb.income, fa.income)}
                    good={tone(fb.income - fa.income, true)}
                />
                <Figure
                    label="Spent a month"
                    value={money(fb.expenses)}
                    was={money(fa.expenses)}
                    delta={formatDelta(fb.expenses, fa.expenses)}
                    good={tone(fb.expenses - fa.expenses, false)}
                />
                <Figure
                    label="Saved a month"
                    value={money(fb.saved)}
                    was={money(fa.saved)}
                    delta={isPrivacyMode ? null : signed(Math.round(fb.saved - fa.saved), rub.format(Math.abs(Math.round(fb.saved - fa.saved))))}
                    good={tone(fb.saved - fa.saved, true)}
                />
                <Figure
                    label="Savings rate"
                    value={rateB === null ? '—' : `${rateB}%`}
                    was={rateA === null ? '—' : `${rateA}%`}
                    delta={rateA === null || rateB === null ? null : signed(rateB - rateA, `${Math.abs(rateB - rateA)} pp`)}
                    good={rateA === null || rateB === null ? null : tone(rateB - rateA, true)}
                />
            </div>

            {notes.length > 0 && (
                <div className="space-y-1">
                    {notes.map(note => (
                        <p key={note} className="flex items-start gap-2 text-xs text-gray-500">
                            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                            <span>{note}</span>
                        </p>
                    ))}
                </div>
            )}

            <ChangeList title="What changed in spending" rows={spending} upIsGood={false} initial={8} isPrivacyMode={isPrivacyMode} onOpen={category => onOpenCategory('expense', category)} />
            <ChangeList title="What changed in income" rows={income} upIsGood initial={4} isPrivacyMode={isPrivacyMode} onOpen={category => onOpenCategory('income', category)} />

            <p className="text-xs text-gray-400">
                Per average month, counted by days, so chapters of different length compare fairly. Transfers
                between your own wallets don't count.
            </p>
        </div>
    );
}

function RangeLine({ side, range }: { side: Side; range: RangeStats }) {
    return (
        <div className="flex items-center gap-2 text-xs text-gray-500">
            <span
                className="flex-shrink-0 w-4 h-4 rounded text-[10px] font-bold flex items-center justify-center text-white"
                style={{ backgroundColor: SIDE_COLORS[side].bar }}
            >
                {side.toUpperCase()}
            </span>
            <span className="tabular-nums">
                {formatDay(range.from)} – {formatDay(range.to)} · {formatLength(range.days)}
            </span>
        </div>
    );
}

function Figure({ label, value, was, delta, good }: {
    label: string; value: string; was: string; delta: string | null; good: boolean | null;
}) {
    return (
        <div className="rounded-xl bg-gray-50 px-3 py-2.5 min-w-0">
            <div className="text-xs font-medium text-gray-500 truncate">{label}</div>
            <div className="text-lg font-bold text-gray-900 tabular-nums truncate">{value}</div>
            <div className="text-xs text-gray-400 leading-snug">
                was {was}
                {delta && (
                    <>
                        {' · '}
                        <span className={cn("font-medium", good === null ? "text-gray-500" : good ? "text-emerald-600" : "text-rose-600")}>{delta}</span>
                    </>
                )}
            </div>
        </div>
    );
}

function ChangeList({ title, rows, upIsGood, initial, isPrivacyMode, onOpen }: {
    title: string; rows: CategoryChange[]; upIsGood: boolean; initial: number; isPrivacyMode: boolean;
    onOpen: (category: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const shown = expanded ? rows : rows.slice(0, initial);
    const maxDelta = Math.max(1, ...shown.map(r => Math.abs(r.delta)));
    const amount = (n: number) => (isPrivacyMode ? '•••' : plain.format(Math.round(n)));
    // With amounts hidden the change reads as a share; a category missing on one side has none.
    const change = (r: CategoryChange) => {
        if (!isPrivacyMode) return signed(Math.round(r.delta), plain.format(Math.abs(Math.round(r.delta))));
        if (Math.round(r.a) === 0) return 'new';
        if (Math.round(r.b) === 0) return 'gone';
        return formatDelta(r.b, r.a) ?? '';
    };
    // Phones drop the A column and show it under B, leaving the category name room to read.
    const grid = "grid grid-cols-[minmax(0,1fr)_auto_4.75rem] sm:grid-cols-[minmax(0,1fr)_5rem_5rem_5.25rem_4.5rem] items-center gap-x-3 sm:gap-x-2";

    return (
        <div>
            <div className="flex items-baseline justify-between gap-3 mb-1">
                <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
                <span className="text-[11px] text-gray-400">₽ a month</span>
            </div>
            {rows.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">No change</p>
            ) : (
                <>
                    <div className={cn(grid, "py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400")}>
                        <span>Category</span>
                        <span className="hidden sm:block text-right">A</span>
                        <span className="text-right"><span className="sm:hidden">B (was A)</span><span className="hidden sm:inline">B</span></span>
                        <span className="text-right">Change</span>
                        <span className="hidden sm:block" />
                    </div>
                    {shown.map(r => {
                        const Icon = getCategoryIcon(r.category);
                        const color = stringToColor(r.category);
                        const good = (r.delta > 0) === upIsGood;
                        const width = (Math.abs(r.delta) / maxDelta) * 50;
                        return (
                            <button
                                key={r.category}
                                type="button"
                                onClick={() => onOpen(r.category)}
                                title={`Show the ${r.category} operations on both sides`}
                                className={cn(grid, "w-full text-left py-2 border-t border-gray-100 text-sm hover:bg-gray-50 transition-colors")}
                            >
                                <span className="flex items-center gap-2 min-w-0">
                                    <span className={cn("p-1.5 rounded-lg flex-shrink-0", color.bg, color.text)}>
                                        <Icon className="w-3.5 h-3.5" />
                                    </span>
                                    <span className="truncate text-gray-800" title={r.category}>{r.category}</span>
                                </span>
                                <span className="hidden sm:block text-right tabular-nums text-gray-400">{amount(r.a)}</span>
                                <span className="text-right tabular-nums text-gray-900">
                                    {amount(r.b)}
                                    <span className="sm:hidden block text-[11px] text-gray-400">was {amount(r.a)}</span>
                                </span>
                                <span className={cn("text-right tabular-nums font-medium", good ? "text-emerald-600" : "text-rose-600")}>{change(r)}</span>
                                <span className="hidden sm:block relative h-2 ml-1" aria-hidden="true">
                                    <span className="absolute left-1/2 -top-1 -bottom-1 w-px bg-gray-200" />
                                    <span
                                        className={cn("absolute top-0 h-2 rounded-sm", good ? "bg-emerald-400" : "bg-rose-400")}
                                        style={{ left: `${r.delta > 0 ? 50 : 50 - width}%`, width: `${width}%` }}
                                    />
                                </span>
                            </button>
                        );
                    })}
                    {rows.length > initial && (
                        <button
                            type="button"
                            onClick={() => setExpanded(v => !v)}
                            className="mt-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                        >
                            {expanded ? 'Show fewer' : `Show all ${rows.length}`}
                        </button>
                    )}
                </>
            )}
        </div>
    );
}
