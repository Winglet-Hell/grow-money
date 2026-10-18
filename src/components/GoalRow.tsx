import React from 'react';
import { CheckCircle2, Loader2, Pencil, RotateCcw } from 'lucide-react';
import { DEFAULT_GOAL_ICON, formatSpan, MAX_MONTHS, type Goal, type GoalPlan } from '../lib/goals';
import { formatCurrencyAmount } from '../lib/currencies';
import { monthLabel } from '../lib/periods';
import { formatDayKey } from '../lib/milestones';
import { cn } from '../lib/utils';

// Shared column template: icon · goal · price · funded · reached by · actions. On phones the row
// keeps the icon, the goal and the date; the goal's second line carries the price and the share.
export const GOAL_GRID = 'md:grid-cols-[2.25rem_minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_4.5rem]';

const rub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });

// Rubles read like everywhere else in the app; other currencies as the Wallets page writes them.
const priceOf = (goal: Goal) => (goal.currency === 'RUB' ? rub.format(goal.price) : formatCurrencyAmount(goal.price, goal.currency));
const percent = (share: number) => (share >= 0.995 ? '100%' : share > 0 && share < 0.01 ? '<1%' : `${Math.floor(share * 100)}%`);

const rowClass = "grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 md:px-6 py-3 border-b border-gray-100 last:border-0 transition-colors cursor-pointer hover:bg-gray-50/70 focus:outline-none focus-visible:bg-emerald-50/50";

const onActivate = (action: () => void) => ({
    role: 'button' as const,
    tabIndex: 0,
    onClick: action,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); action(); } },
});

const IconBox = ({ icon, muted }: { icon: string | null; muted?: boolean }) => (
    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center text-xl leading-none", muted ? "bg-gray-100 grayscale-[60%]" : "bg-emerald-50")} aria-hidden>
        {icon ?? DEFAULT_GOAL_ICON}
    </div>
);

const ActionButton = ({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) => (
    <button
        type="button"
        onClick={e => { e.stopPropagation(); onClick(); }}
        onKeyDown={e => e.stopPropagation()}
        className="p-1.5 text-gray-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
        title={title}
        aria-label={title}
    >
        {children}
    </button>
);

interface GoalRowProps {
    plan: GoalPlan;
    isPrivacyMode: boolean;
    busy: boolean;
    onEdit: (goal: Goal) => void;
    onReached: (goal: Goal) => void;
}

/** An open goal: its price, how much of the net worth falls to it, and when the pace gets there. */
export const GoalRow: React.FC<GoalRowProps> = ({ plan, isPrivacyMode, busy, onEdit, onReached }) => {
    const { goal, costRub, funded, reachedNow, monthsAway, date } = plan;
    const money = (n: number) => (isPrivacyMode ? '••••' : rub.format(n));
    const share = costRub ? funded / costRub : 0;
    const left = costRub !== null ? costRub - funded : null;

    const when = reachedNow
        ? { main: 'Now', sub: 'covered today', good: true }
        : date
            ? { main: monthLabel(date.slice(0, 7), 'short'), sub: `in ${formatSpan(monthsAway!)}`, good: false }
            : costRub === null
                ? { main: '—', sub: `no rate for ${goal.currency}`, good: false }
                : { main: '—', sub: monthsAway !== null && monthsAway > MAX_MONTHS ? 'over 100 years' : 'not at this pace', good: false };

    return (
        <div {...onActivate(() => onEdit(goal))} className={cn(rowClass, GOAL_GRID)} aria-label={`Edit ${goal.name}`}>
            <IconBox icon={goal.icon} />

            {/* Goal */}
            <div className="min-w-0">
                <div className="font-medium text-gray-900 truncate" title={goal.name}>{goal.name}</div>
                <div className="text-xs text-gray-400 truncate tabular-nums">
                    <span className="md:hidden">{isPrivacyMode ? '••••' : priceOf(goal)}{costRub !== null && ` · ${percent(share)}`}</span>
                    <span className="hidden md:inline">
                        {costRub === null
                            ? <span className="text-amber-600">no rate for {goal.currency}: not counted</span>
                            : reachedNow ? 'covered by your net worth' : `${money(left!)} to go`}
                    </span>
                </div>
            </div>

            {/* Price */}
            <div className="hidden md:block text-right tabular-nums">
                <div className="font-semibold text-gray-900 whitespace-nowrap">{isPrivacyMode ? '••••' : priceOf(goal)}</div>
                {goal.currency !== 'RUB' && costRub !== null && <div className="text-xs text-gray-400">≈ {money(costRub)}</div>}
            </div>

            {/* Funded */}
            <div className="hidden md:flex items-center gap-2" title={costRub !== null ? `${money(funded)} of the net worth falls to this goal` : undefined}>
                <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className={cn("h-full rounded-full", reachedNow ? "bg-emerald-500" : "bg-emerald-400")} style={{ width: `${Math.min(100, share * 100)}%` }} />
                </div>
                <span className="text-xs text-gray-500 tabular-nums w-10 text-right">{costRub !== null ? percent(share) : '—'}</span>
            </div>

            {/* Reached by */}
            <div className="text-right md:text-left">
                <div className={cn("text-sm font-semibold tabular-nums whitespace-nowrap inline-flex items-center gap-1", when.good ? "text-emerald-600" : "text-gray-900")}>
                    {when.good && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {when.main}
                </div>
                <div className={cn("text-xs whitespace-nowrap", costRub === null ? "text-amber-600" : "text-gray-400")}>{when.sub}</div>
            </div>

            {/* Actions */}
            <div className="hidden md:flex justify-end gap-0.5">
                {busy
                    ? <Loader2 className="w-4 h-4 m-1.5 animate-spin text-emerald-500" />
                    : <ActionButton title={`Mark ${goal.name} as reached`} onClick={() => onReached(goal)}><CheckCircle2 className="w-4 h-4" /></ActionButton>}
                <ActionButton title={`Edit ${goal.name}`} onClick={() => onEdit(goal)}><Pencil className="w-4 h-4" /></ActionButton>
            </div>
        </div>
    );
};

interface ReachedGoalRowProps {
    goal: Goal;
    isPrivacyMode: boolean;
    busy: boolean;
    onEdit: (goal: Goal) => void;
    onReopen: (goal: Goal) => void;
}

/** A goal already reached: out of the plan, kept with the day it was reached. */
export const ReachedGoalRow: React.FC<ReachedGoalRowProps> = ({ goal, isPrivacyMode, busy, onEdit, onReopen }) => (
    <div {...onActivate(() => onEdit(goal))} className={cn(rowClass, GOAL_GRID)} aria-label={`Edit ${goal.name}`}>
        <IconBox icon={goal.icon} muted />
        <div className="min-w-0">
            <div className="font-medium text-gray-600 truncate" title={goal.name}>{goal.name}</div>
            <div className="text-xs text-gray-400 truncate tabular-nums">
                <span className="md:hidden">{isPrivacyMode ? '••••' : priceOf(goal)} · </span>
                reached {formatDayKey(goal.reachedOn!)}
            </div>
        </div>
        <div className="hidden md:block text-right font-semibold text-gray-500 tabular-nums whitespace-nowrap">{isPrivacyMode ? '••••' : priceOf(goal)}</div>
        <div className="hidden md:block" />
        <div className="text-right md:text-left text-sm font-semibold text-gray-500 tabular-nums whitespace-nowrap inline-flex items-center gap-1 justify-end md:justify-start">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            {monthLabel(goal.reachedOn!.slice(0, 7), 'short')}
        </div>
        <div className="hidden md:flex justify-end gap-0.5">
            {busy
                ? <Loader2 className="w-4 h-4 m-1.5 animate-spin text-emerald-500" />
                : <ActionButton title={`Open ${goal.name} again`} onClick={() => onReopen(goal)}><RotateCcw className="w-4 h-4" /></ActionButton>}
            <ActionButton title={`Edit ${goal.name}`} onClick={() => onEdit(goal)}><Pencil className="w-4 h-4" /></ActionButton>
        </div>
    </div>
);
