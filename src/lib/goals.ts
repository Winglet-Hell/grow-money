import type { Transaction } from '../types';
import type { NetWorthPoint } from './netWorth';
import { dateKeyOf, daysInMonth, monthKeyFromDate, monthLabel, shiftMonthKey } from './periods';

// Goals: sums the net worth is meant to reach — a purchase, or a sum to retire on — and when it
// gets there at the pace money is saved. They live in Supabase's `wishlist` table, named after
// the page's first version; lib/goalsStore reads and writes it.

export type GoalPriority = 'High' | 'Medium' | 'Low';
export const PRIORITIES: GoalPriority[] = ['High', 'Medium', 'Low'];

export interface Goal {
    id: string;
    name: string;
    price: number;            // in `currency`
    currency: string;
    costRUB: number;          // the price in rubles when the goal was last saved
    priority: GoalPriority;
    icon: string | null;      // an emoji; null = DEFAULT_GOAL_ICON
    reachedOn: string | null; // "YYYY-MM-DD" once reached or bought
    createdAt: string;
}

/** What the goal form edits. */
export interface GoalValues {
    name: string;
    price: number;
    currency: string;
    priority: GoalPriority;
    icon: string | null;
}

export const DEFAULT_GOAL_ICON = '🎯';
export const GOAL_ICON_CHOICES = ['🎯', '🏝️', '🏠', '🚗', '✈️', '💻', '📱', '🎧', '📷', '⌚', '🎮', '🚲', '🎁', '💍', '🎓', '👶', '🏋️', '⭐'];

// The first version of the page stored a Lucide icon's name in "imageURL".
const LEGACY_ICONS: Record<string, string> = {
    ShoppingBag: '🛍️', Laptop: '💻', Smartphone: '📱', Headphones: '🎧', Car: '🚗', Home: '🏠', Plane: '✈️',
    Gift: '🎁', Gamepad: '🎮', Camera: '📷', Watch: '⌚', Bike: '🚲', Music: '🎵', Book: '📚', Dumbbell: '🏋️',
    Coffee: '☕', Zap: '⚡', Star: '⭐',
};

// A row of the `wishlist` table.
export type GoalRow = {
    id: string;
    created_at: string;
    name: string;
    costRUB: number | string;
    priority: string;
    imageURL: string | null;
    // Added by supabase_migration_goals.sql; missing until it has run.
    price?: number | string | null;
    currency?: string | null;
    reached_on?: string | null;
};

function iconOf(stored: string | null): string | null {
    if (!stored) return null;
    if (LEGACY_ICONS[stored]) return LEGACY_ICONS[stored];
    // A picture's URL was never settable from the form, and a bare word is an icon name we don't know.
    if (/^https?:/.test(stored) || /^[A-Za-z]+$/.test(stored)) return null;
    return stored;
}

export function goalFromRow(row: GoalRow): Goal {
    const costRUB = Number(row.costRUB) || 0;
    return {
        id: row.id,
        name: row.name,
        price: row.price == null ? costRUB : Number(row.price),
        currency: row.currency || 'RUB',
        costRUB,
        priority: PRIORITIES.includes(row.priority as GoalPriority) ? (row.priority as GoalPriority) : 'Medium',
        icon: iconOf(row.imageURL),
        reachedOn: row.reached_on ?? null,
        createdAt: row.created_at,
    };
}

// ------------------------------------------------------------------ pace

export interface SavingPace {
    perMonth: number; // income minus spending, rubles a month; negative when spending was ahead
    months: string[]; // the months averaged, "YYYY-MM", oldest first
}

/**
 * What a month puts aside on average: income minus spending over the last `count` complete
 * months, transfers left out, as on the dashboard. The running month is never complete, nor is the
 * statement's first month unless it starts on the 1st. When the data stops before a month ends,
 * that month waits for the next import.
 */
export function savingPace(transactions: Transaction[], count: number, now = new Date()): SavingPace | null {
    const net = new Map<string, number>();
    let first: string | null = null;
    let last: string | null = null;
    for (const t of transactions) {
        const day = dateKeyOf(t.date);
        if (!day) continue;
        if (!first || day < first) first = day;
        if (!last || day > last) last = day;
        if (t.type !== 'income' && t.type !== 'expense') continue;
        const key = day.slice(0, 7);
        net.set(key, (net.get(key) ?? 0) + (t.type === 'income' ? Math.abs(t.amount) : -Math.abs(t.amount)));
    }
    if (!first || !last) return null;

    const firstMonth = first.endsWith('-01') ? first.slice(0, 7) : shiftMonthKey(first.slice(0, 7), 1);
    const lastMonth = last.slice(0, 7);
    const lastComplete = last.slice(8, 10) === String(daysInMonth(lastMonth)) ? lastMonth : shiftMonthKey(lastMonth, -1);
    const beforeNow = shiftMonthKey(monthKeyFromDate(now), -1);
    const end = lastComplete < beforeNow ? lastComplete : beforeNow;

    const months: string[] = [];
    for (let key = end; key >= firstMonth && months.length < count; key = shiftMonthKey(key, -1)) months.unshift(key);
    if (months.length === 0) return null;
    const total = months.reduce((s, key) => s + (net.get(key) ?? 0), 0);
    return { perMonth: total / months.length, months };
}

/**
 * How much the net worth changed a month over the same months, read off the Wallets chart's weekly
 * points the way its table reads them: each month's last point. Null when the history doesn't
 * reach back to the month before the first one.
 */
export function netWorthGrowth(points: NetWorthPoint[], months: string[]): number | null {
    if (months.length === 0 || points.length === 0) return null;
    const endOf = new Map<string, number>();
    for (const p of points) endOf.set(p.day.slice(0, 7), p.total);
    const before = endOf.get(shiftMonthKey(months[0], -1));
    const end = endOf.get(months[months.length - 1]);
    return before === undefined || end === undefined ? null : (end - before) / months.length;
}

/** "Apr–Sep 2026", "Oct 2025 – Sep 2026", or one month "Sep 2026". */
export function monthsLabel(months: string[]): string {
    if (months.length === 0) return '';
    const first = months[0];
    const last = months[months.length - 1];
    if (first === last) return monthLabel(last, 'short');
    if (first.slice(0, 4) === last.slice(0, 4)) return `${monthLabel(first, 'month')}–${monthLabel(last, 'short')}`;
    return `${monthLabel(first, 'short')} – ${monthLabel(last, 'short')}`;
}

// ------------------------------------------------------------------ plan

// Past this a date says nothing, and far enough out it isn't a valid Date at all.
export const MAX_MONTHS = 1200;
const AVG_MONTH_MS = (365.2425 / 12) * 86_400_000;

/** The day `months` (fractional) after `day`. */
export function addMonths(day: string, months: number): string {
    return new Date(Date.parse(`${day}T00:00:00Z`) + months * AVG_MONTH_MS).toISOString().slice(0, 10);
}

export interface GoalPlan {
    goal: Goal;
    costRub: number | null;    // the price in rubles at today's rate; null = no rate for its currency
    ahead: number;             // what the goals before it need, rubles
    funded: number;            // the part of the net worth that falls to it, 0…costRub
    reachedNow: boolean;       // the net worth covers it and every goal before it
    monthsAway: number | null; // at the saving pace; null = it doesn't get there at this pace
    date: string | null;       // "YYYY-MM-DD" when the pace's line covers it
}

const RANK: Record<GoalPriority, number> = { High: 0, Medium: 1, Low: 2 };

/**
 * The net worth handed out to the open goals in turn — High first, the cheaper goal first within a
 * priority — so no two goals count the same money. A goal's date is when the net worth, growing by
 * `pace` a month, covers it together with every goal before it.
 */
export function planGoals(
    goals: Goal[],
    netWorth: number,
    pace: number | null,
    rubOf: (goal: Goal) => number | null,
    today: string,
): GoalPlan[] {
    const valued = goals.map(goal => ({ goal, costRub: rubOf(goal) }));
    valued.sort((a, b) =>
        RANK[a.goal.priority] - RANK[b.goal.priority]
        || (a.costRub ?? Infinity) - (b.costRub ?? Infinity)
        || a.goal.createdAt.localeCompare(b.goal.createdAt));

    let ahead = 0;
    return valued.map(({ goal, costRub }): GoalPlan => {
        if (costRub === null) return { goal, costRub, ahead, funded: 0, reachedNow: false, monthsAway: null, date: null };
        const need = ahead + costRub;
        const reachedNow = netWorth >= need;
        const monthsAway = reachedNow ? 0 : pace !== null && pace > 0 ? (need - netWorth) / pace : null;
        const plan: GoalPlan = {
            goal,
            costRub,
            ahead,
            funded: Math.min(costRub, Math.max(0, netWorth - ahead)),
            reachedNow,
            monthsAway,
            date: monthsAway === null || monthsAway > MAX_MONTHS ? null : addMonths(today, monthsAway),
        };
        ahead = need;
        return plan;
    });
}

/** "3 years 4 months", "11 months", "under a month". */
export function formatSpan(months: number): string {
    if (months > MAX_MONTHS) return 'over 100 years';
    const total = Math.round(months);
    if (total < 1) return 'under a month';
    const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
    const years = Math.floor(total / 12);
    const rest = total % 12;
    return [years ? part(years, 'year') : '', rest ? part(rest, 'month') : ''].filter(Boolean).join(' ');
}
