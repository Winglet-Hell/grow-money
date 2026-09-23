import { Briefcase, GraduationCap, Heart, HeartPulse, Home, Key, PiggyBank, Star, type LucideIcon } from 'lucide-react';
import type { Milestone, MilestoneKind, Transaction } from '../types';
import { dateKeyOf } from './periods';
import { isPlannedPayment } from './categoryGroups';

// Milestones are points in time; the stretches between them are chapters. Everything here is
// compared per average month, counted by days, so a five-month chapter and an eleven-month
// one line up, and a milestone in the middle of a month splits that month where it happened.

export const DAYS_PER_MONTH = 365.25 / 12;

// Below this a chapter's monthly figures are shaky: rent paid in the first days of a
// two-week chapter reads as double the usual month.
export const SHORT_CHAPTER_DAYS = 60;

export const MILESTONE_KINDS: { id: MilestoneKind; label: string; icon: LucideIcon }[] = [
    { id: 'move', label: 'Move', icon: Home },
    { id: 'work', label: 'Work', icon: Briefcase },
    { id: 'family', label: 'Family', icon: Heart },
    { id: 'purchase', label: 'Purchase', icon: Key },
    { id: 'health', label: 'Health', icon: HeartPulse },
    { id: 'study', label: 'Study', icon: GraduationCap },
    { id: 'money', label: 'Money', icon: PiggyBank },
    { id: 'other', label: 'Other', icon: Star },
];

// A is the earlier side of a comparison, B the later one — the same two colours on the
// timeline, the chapter list and the comparison itself.
export const SIDE_COLORS = {
    a: { bar: '#38bdf8', band: '#e0f2fe', text: '#0369a1' }, // sky
    b: { bar: '#a78bfa', band: '#ede9fe', text: '#6d28d9' }, // violet
} as const;

// A plain lookup rather than a function, so components can render `KIND_ICONS[kind]` directly.
export const KIND_ICONS = Object.fromEntries(MILESTONE_KINDS.map(k => [k.id, k.icon])) as Record<MilestoneKind, LucideIcon>;
export const kindLabel = (kind: MilestoneKind) => MILESTONE_KINDS.find(k => k.id === kind)?.label ?? 'Other';

export const sortMilestones = (list: Milestone[]) =>
    [...list].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

/** Saved milestones as the page can use them: readable ones only, known kinds, in date order. */
export function normalizeMilestones(saved: unknown): Milestone[] {
    if (!Array.isArray(saved)) return [];
    const kinds = new Set<string>(MILESTONE_KINDS.map(k => k.id));
    return sortMilestones(
        saved
            .filter((m): m is Milestone =>
                !!m && typeof m.id === 'string' && typeof m.title === 'string' &&
                typeof m.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.date))
            .map(m => (kinds.has(m.kind) ? m : { ...m, kind: 'other' as const }))
    );
}

// ------------------------------------------------------------------ calendar days

const DAY_MS = 86_400_000;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Days since 1970-01-01 for a "YYYY-MM-DD" key: calendar arithmetic with no time zone in it. */
export const dayNumber = (key: string) =>
    Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10))) / DAY_MS;

const keyOfDayNumber = (n: number) => {
    const d = new Date(n * DAY_MS);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

export const addDays = (key: string, days: number) => keyOfDayNumber(dayNumber(key) + days);

/** Both ends included: the same day twice is one day. */
export const daysInRange = (from: string, to: string) => dayNumber(to) - dayNumber(from) + 1;

/** The same day `months` later (or earlier), kept inside the target month: 31 Aug − 6 → 28 Feb. */
export function addMonths(key: string, months: number): string {
    const first = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + months, 1));
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return `${first.getUTCFullYear()}-${pad2(first.getUTCMonth() + 1)}-${pad2(Math.min(Number(key.slice(8, 10)), lastDay))}`;
}

const shortMonth = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });

/** "1 Jun 2026" — built by hand, as en-GB now spells September "Sept". */
export const formatDayKey = (key: string) =>
    `${Number(key.slice(8, 10))} ${shortMonth.format(new Date(`${key}T00:00:00Z`))} ${key.slice(0, 4)}`;

/** "Today" in the viewer's own calendar, as a day key. */
export const todayKey = (now = new Date()) =>
    `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

// ------------------------------------------------------------------ flows

/** One income or expense row, reduced to what the chapter maths needs. */
interface Flow {
    day: string;
    type: 'income' | 'expense';
    amount: number; // positive, in the accounting currency
    category: string;
}

export interface FlowSet {
    flows: Flow[];       // sorted by day
    first: string | null; // the statement's first and last day
    last: string | null;
}

/**
 * Income and expense rows by day. Transfers move money between the user's own wallets, so
 * they are neither — but they still show which days the statement covers.
 * `excludePlanned` drops the big planned payments (rent, flights, tech…) to leave everyday spending.
 */
export function prepareFlows(transactions: Transaction[], { excludePlanned = false } = {}): FlowSet {
    const flows: Flow[] = [];
    let first: string | null = null;
    let last: string | null = null;
    for (const t of transactions) {
        const day = dateKeyOf(t.date);
        if (!day) continue;
        if (!first || day < first) first = day;
        if (!last || day > last) last = day;
        if (t.type !== 'income' && t.type !== 'expense') continue;
        if (t.type === 'expense' && excludePlanned && isPlannedPayment(t.category)) continue;
        flows.push({ day, type: t.type, amount: Math.abs(t.amount), category: t.category || 'Uncategorized' });
    }
    flows.sort((a, b) => a.day.localeCompare(b.day));
    return { flows, first, last };
}

export interface RangeStats {
    from: string; // both ends included
    to: string;
    days: number;
    income: number; // totals over the range
    expenses: number;
    expenseByCategory: Record<string, number>;
    incomeByCategory: Record<string, number>;
    operations: number;
}

export function rangeStats(set: FlowSet, from: string, to: string): RangeStats {
    const stats: RangeStats = {
        from, to, days: daysInRange(from, to),
        income: 0, expenses: 0, expenseByCategory: {}, incomeByCategory: {}, operations: 0,
    };
    for (const f of set.flows) {
        if (f.day < from) continue;
        if (f.day > to) break;
        stats.operations++;
        if (f.type === 'income') {
            stats.income += f.amount;
            stats.incomeByCategory[f.category] = (stats.incomeByCategory[f.category] ?? 0) + f.amount;
        } else {
            stats.expenses += f.amount;
            stats.expenseByCategory[f.category] = (stats.expenseByCategory[f.category] ?? 0) + f.amount;
        }
    }
    return stats;
}

/** A total over `days` days as an average month. */
export const perMonth = (total: number, days: number) => (days > 0 ? (total / days) * DAYS_PER_MONTH : 0);

export interface MonthlyFigures {
    income: number;
    expenses: number;
    saved: number;
    savingsRate: number | null; // null without income
}

export function monthlyFigures(stats: RangeStats): MonthlyFigures {
    const income = perMonth(stats.income, stats.days);
    const expenses = perMonth(stats.expenses, stats.days);
    return { income, expenses, saved: income - expenses, savingsRate: income > 0 ? (income - expenses) / income : null };
}

// ------------------------------------------------------------------ chapters

export interface Chapter {
    key: string;              // "start" for the stretch before any milestone, else the day it opens
    index: number;
    opener: Milestone[];      // what opens it (several when they share a day); empty for "start"
    start: string | null;     // opening day; null runs back past the statement's start
    end: string | null;       // the day the next chapter opens; null when nothing follows yet
    stats: RangeStats | null; // the part the statement covers; null when it covers none of it
    ongoing: boolean;         // still running at the statement's last day
    clippedStart: boolean;    // began before the statement does, so only its tail is measured
}

export const chapterTitle = (c: Chapter) => (c.opener.length ? c.opener.map(m => m.title).join(' · ') : 'Before');

/**
 * Cuts the statement into chapters at every milestone of `kind` ("all" cuts at each one).
 * Milestones on the same day open one chapter together.
 */
export function buildChapters(milestones: Milestone[], set: FlowSet, kind: MilestoneKind | 'all' = 'all'): Chapter[] {
    const cuts: { date: string; milestones: Milestone[] }[] = [];
    for (const m of sortMilestones(milestones)) {
        if (kind !== 'all' && m.kind !== kind) continue;
        const prev = cuts[cuts.length - 1];
        if (prev && prev.date === m.date) prev.milestones.push(m);
        else cuts.push({ date: m.date, milestones: [m] });
    }

    const chapters: Chapter[] = [];
    for (let i = 0; i <= cuts.length; i++) {
        const start = i === 0 ? null : cuts[i - 1].date;
        const end = i < cuts.length ? cuts[i].date : null;
        const lastDay = end ? addDays(end, -1) : null;

        let stats: RangeStats | null = null;
        if (set.first && set.last) {
            const from = start && start > set.first ? start : set.first;
            const to = lastDay && lastDay < set.last ? lastDay : set.last;
            if (from <= to) stats = rangeStats(set, from, to);
        }

        chapters.push({
            key: start ?? 'start',
            index: i,
            opener: i === 0 ? [] : cuts[i - 1].milestones,
            start,
            end,
            stats,
            ongoing: !!stats && !!set.last && (lastDay === null || lastDay > set.last),
            clippedStart: !!stats && !!start && !!set.first && start < set.first,
        });
    }
    return chapters;
}

/**
 * The pair to show first: before and after the latest milestone whose two sides both have
 * data and neither is a few days long; failing that, the latest neighbours with any data.
 */
export function defaultPair(chapters: Chapter[]): [number, number] | null {
    const usable = (c: Chapter, strict: boolean) => !!c.stats && (!strict || c.stats.days >= SHORT_CHAPTER_DAYS);
    for (const strict of [true, false]) {
        for (let i = chapters.length - 1; i > 0; i--) {
            if (usable(chapters[i], strict) && usable(chapters[i - 1], strict)) return [i - 1, i];
        }
    }
    const withData = chapters.filter(c => c.stats);
    return withData.length >= 2 ? [withData[withData.length - 2].index, withData[withData.length - 1].index] : null;
}

// ------------------------------------------------------------------ comparing

// How much of each side a before-and-after comparison takes: whole chapters, or the months
// right before and right after the milestone (never reaching into further chapters).
export type CompareWindow = 'chapter' | 3 | 6 | 12;

export interface Comparison {
    a: RangeStats;
    b: RangeStats;
    around: string | null; // the milestone day when A and B are its two sides
    windowed: boolean;     // a window shortened at least one side
}

export function compareChapters(set: FlowSet, a: Chapter, b: Chapter, window: CompareWindow): Comparison | null {
    if (!a.stats || !b.stats) return null;
    const around = b.index === a.index + 1 ? b.start : null;
    if (!around || window === 'chapter') return { a: a.stats, b: b.stats, around, windowed: false };

    const aFrom = addMonths(around, -window);
    const bTo = addDays(addMonths(around, window), -1);
    const aRange = aFrom > a.stats.from ? rangeStats(set, aFrom, a.stats.to) : a.stats;
    const bRange = bTo < b.stats.to ? rangeStats(set, b.stats.from, bTo) : b.stats;
    return { a: aRange, b: bRange, around, windowed: aRange !== a.stats || bRange !== b.stats };
}

export interface CategoryChange {
    category: string;
    a: number; // per month
    b: number;
    delta: number;
}

/** Every category on either side, per month, the biggest move first. */
export function categoryChanges(
    a: Record<string, number>, aDays: number,
    b: Record<string, number>, bDays: number,
): CategoryChange[] {
    const names = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...names]
        .map(category => {
            const av = perMonth(a[category] ?? 0, aDays);
            const bv = perMonth(b[category] ?? 0, bDays);
            return { category, a: av, b: bv, delta: bv - av };
        })
        .filter(c => Math.round(c.delta) !== 0)
        .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

// ------------------------------------------------------------------ timeline

export interface MonthPoint {
    key: string;      // "YYYY-MM"
    from: string;     // the days of this month the statement covers
    to: string;
    income: number;
    expenses: number;
    partial: boolean; // the statement covers only part of this month
}

/** Month by month over the whole statement, for the timeline chart. */
export function monthlySeries(set: FlowSet): MonthPoint[] {
    if (!set.first || !set.last) return [];
    const points: MonthPoint[] = [];
    const index = new Map<string, MonthPoint>();
    for (let start = `${set.first.slice(0, 7)}-01`; start <= set.last; start = addMonths(start, 1)) {
        const end = addDays(addMonths(start, 1), -1);
        const from = start < set.first ? set.first : start;
        const to = end > set.last ? set.last : end;
        const point = { key: start.slice(0, 7), from, to, income: 0, expenses: 0, partial: from !== start || to !== end };
        points.push(point);
        index.set(point.key, point);
    }
    for (const f of set.flows) {
        const point = index.get(f.day.slice(0, 7));
        if (!point) continue;
        if (f.type === 'income') point.income += f.amount;
        else point.expenses += f.amount;
    }
    return points;
}

/** Where a day sits on the timeline, in months from the start of `firstMonth` (fractions within the month). */
export function monthOffset(day: string, firstMonth: string): number {
    const months = (Number(day.slice(0, 4)) - Number(firstMonth.slice(0, 4))) * 12
        + Number(day.slice(5, 7)) - Number(firstMonth.slice(5, 7));
    const monthDays = daysInRange(`${day.slice(0, 7)}-01`, addDays(addMonths(`${day.slice(0, 7)}-01`, 1), -1));
    return months + (Number(day.slice(8, 10)) - 1) / monthDays;
}
