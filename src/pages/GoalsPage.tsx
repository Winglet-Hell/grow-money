import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, Flag, Loader2, PiggyBank, Plus, RefreshCw, Target, Wallet, Wifi, WifiOff, X } from 'lucide-react';
import type { Transaction } from '../types';
import { useAccounts } from '../hooks/useAccounts';
import { useNetWorthSeries } from '../hooks/useNetWorthSeries';
import { usePrivacy } from '../contexts/PrivacyContext';
import {
    formatSpan, monthsLabel, netWorthGrowth, planGoals, savingPace,
    DEFAULT_GOAL_ICON, PRIORITIES, type Goal, type GoalPriority, type GoalValues,
} from '../lib/goals';
import { createGoal, deleteGoal, loadGoals, setGoalReached, updateGoal, MIGRATION_HINT } from '../lib/goalsStore';
import { monthLabel } from '../lib/periods';
import { todayKey } from '../lib/milestones';
import { GoalRow, ReachedGoalRow, GOAL_GRID } from '../components/GoalRow';
import { GoalFormModal } from '../components/GoalFormModal';
import { GoalsChart } from '../components/GoalsChart';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { cn } from '../lib/utils';

interface GoalsPageProps {
    transactions: Transaction[];
    userId?: string;
}

// How many complete months the saving pace averages. Per-device, like the dashboard's period.
type PaceWindow = 3 | 6 | 12;
const WINDOWS: { months: PaceWindow; label: string }[] = [
    { months: 3, label: '3 months' },
    { months: 6, label: '6 months' },
    { months: 12, label: 'Year' },
];
const WINDOW_KEY = 'goalsPaceMonths';
const readWindow = (): PaceWindow => {
    try {
        const v = Number(localStorage.getItem(WINDOW_KEY));
        return v === 3 || v === 12 ? v : 6;
    } catch {
        return 6;
    }
};
const storeWindow = (v: PaceWindow) => { try { localStorage.setItem(WINDOW_KEY, String(v)); } catch { /* storage blocked */ } };

const rub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const PRIORITY_TITLE: Record<GoalPriority, string> = { High: 'High priority', Medium: 'Medium priority', Low: 'Low priority' };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function GoalsPage({ transactions, userId }: GoalsPageProps) {
    const navigate = useNavigate();
    const { isPrivacyMode } = usePrivacy();
    // The same hook and the same total as the Wallets page: archived wallets are left out.
    const { accounts, totalNetWorth, rates, isLoadingRates, isLoadingAccounts, isLiveRates } = useAccounts(transactions);
    const series = useNetWorthSeries(transactions, rates);

    const [goals, setGoals] = useState<Goal[]>([]);
    const [loading, setLoading] = useState(!!userId);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [needsMigration, setNeedsMigration] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [form, setForm] = useState<{ goal: Goal | null } | null>(null);
    const [toDelete, setToDelete] = useState<Goal | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [showReached, setShowReached] = useState(false);
    const [paceWindow, setPaceWindowState] = useState<PaceWindow>(readWindow);
    const setPaceWindow = (v: PaceWindow) => { setPaceWindowState(v); storeWindow(v); };

    // "Try again" bumps the key, which loads the goals once more.
    const [reloadKey, setReloadKey] = useState(0);
    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        loadGoals(userId).then(
            result => {
                if (cancelled) return;
                setGoals(result.goals);
                setNeedsMigration(result.needsMigration);
                setLoadError(null);
                setLoading(false);
            },
            (e: unknown) => {
                if (cancelled) return;
                setLoadError(e instanceof Error ? e.message : String(e));
                setLoading(false);
            },
        );
        return () => { cancelled = true; };
    }, [userId, reloadKey]);
    const retry = () => { setLoading(true); setLoadError(null); setReloadKey(k => k + 1); };

    const money = (n: number) => (isPrivacyMode ? '••••••' : rub.format(n));
    const today = todayKey();
    // Until the wallets and today's rates are in, the net worth is 0 or valued at fallback rates,
    // and every date would jump a moment later. Hold the numbers that depend on it till then.
    const ready = !isLoadingAccounts && !isLoadingRates;
    // The tiles and the chart that speak about goals also wait for the goals themselves.
    const planReady = ready && !loading;

    // Rubles a unit of a goal's currency, from the same rates the wallets are valued at.
    const rubPerUnit = useCallback((currency: string): number | null => {
        if (currency === 'RUB') return 1;
        const rate = rates[currency];
        return typeof rate === 'number' && rate > 0 ? rate : null;
    }, [rates]);
    const rubOf = useCallback((goal: Goal) => {
        const rate = rubPerUnit(goal.currency);
        return rate === null ? null : goal.price * rate;
    }, [rubPerUnit]);

    const pace = useMemo(() => savingPace(transactions, paceWindow), [transactions, paceWindow]);
    const growth = useMemo(() => (pace ? netWorthGrowth(series.points, pace.months) : null), [pace, series.points]);

    const open = useMemo(() => goals.filter(g => !g.reachedOn), [goals]);
    const reached = useMemo(() => goals.filter(g => g.reachedOn).sort((a, b) => b.reachedOn!.localeCompare(a.reachedOn!)), [goals]);
    const plans = useMemo(
        () => planGoals(open, totalNetWorth, pace?.perMonth ?? null, rubOf, today),
        [open, totalNetWorth, pace, rubOf, today]
    );
    const groups = useMemo(
        () => PRIORITIES
            .map(priority => {
                const rows = plans.filter(p => p.goal.priority === priority);
                return { priority, rows, total: rows.reduce((s, p) => s + (p.costRub ?? 0), 0) };
            })
            .filter(g => g.rows.length > 0),
        [plans]
    );

    const valued = plans.filter(p => p.costRub !== null);
    const need = valued.reduce((s, p) => s + p.costRub!, 0);
    const next = valued.find(p => !p.reachedNow);
    const walletsWithBalance = accounts.filter(a => !a.archived && a.current !== 0).length;

    // ------------------------------------------------------------------ actions

    const valuesOf = (goal: Goal): GoalValues => ({ name: goal.name, price: goal.price, currency: goal.currency, priority: goal.priority, icon: goal.icon ?? DEFAULT_GOAL_ICON });
    const replace = (goal: Goal) => setGoals(prev => prev.map(g => (g.id === goal.id ? goal : g)));

    const save = async (values: GoalValues) => {
        if (!userId) throw new Error('Sign in to keep goals.');
        // "costRUB" keeps the ruble value as of this save; a currency without a rate keeps the old one.
        const editing = form?.goal ?? null;
        const rate = rubPerUnit(values.currency);
        const costRUB = rate !== null ? Math.round(values.price * rate) : editing?.costRUB ?? 0;
        if (editing) replace(await updateGoal(editing.id, values, costRUB));
        else {
            const created = await createGoal(userId, values, costRUB);
            setGoals(prev => [...prev, created]);
        }
        setNeedsMigration(false);
        setForm(null);
    };

    const markReached = async (goal: Goal, day: string | null) => {
        setBusyId(goal.id);
        setActionError(null);
        try {
            replace(await setGoalReached(goal.id, day));
        } catch (e) {
            setActionError(e instanceof Error ? e.message : String(e));
        }
        setBusyId(null);
    };

    const confirmDelete = async () => {
        if (!toDelete) return;
        setDeleting(true);
        try {
            await deleteGoal(toDelete.id);
            setGoals(prev => prev.filter(g => g.id !== toDelete.id));
            setForm(null);
        } catch (e) {
            setActionError(e instanceof Error ? e.message : String(e));
        }
        setDeleting(false);
        setToDelete(null);
    };

    // ------------------------------------------------------------------ page

    const nextTile = (() => {
        if (open.length === 0) return { value: '—', sub: 'no open goals' };
        if (!next) return valued.length > 0 ? { value: 'Now', sub: 'your net worth covers every open goal' } : { value: '—', sub: 'no rate for the goals’ currencies' };
        const name = `${next.goal.icon ?? DEFAULT_GOAL_ICON} ${next.goal.name}`;
        if (next.date) return { value: monthLabel(next.date.slice(0, 7), 'short'), sub: `${name} · in ${formatSpan(next.monthsAway!)}` };
        return { value: '—', sub: `${name} · not at this pace` };
    })();

    return (
        <div className="enter-cascade space-y-6">
            {/* Header */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Goals</h2>
                    <p className="text-gray-500">
                        When your net worth gets to each goal at the pace you save.{' '}
                        <span className="inline-flex items-center gap-1 text-gray-400">
                            {isLoadingRates ? <Wifi className="w-3.5 h-3.5 animate-pulse" /> : isLiveRates ? <Wifi className="w-3.5 h-3.5 text-emerald-500" /> : <WifiOff className="w-3.5 h-3.5 text-amber-500" />}
                            {isLoadingRates ? 'updating rates' : isLiveRates ? 'live rates' : 'estimated rates (offline)'}
                        </span>
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full lg:w-auto">
                    <PaceTabs value={paceWindow} onChange={setPaceWindow} />
                    {userId && (
                        <button
                            onClick={() => setForm({ goal: null })}
                            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-colors whitespace-nowrap"
                        >
                            <Plus className="w-4 h-4" />
                            Add goal
                        </button>
                    )}
                </div>
            </div>

            {(loadError || actionError || needsMigration) && (
                <div className="space-y-2">
                    {loadError && (
                        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700" role="alert">
                            <span>{loadError}</span>
                            <button onClick={retry} className="inline-flex items-center gap-1.5 font-semibold hover:text-red-900 whitespace-nowrap">
                                <RefreshCw className="w-4 h-4" /> Try again
                            </button>
                        </div>
                    )}
                    {actionError && (
                        <div className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700" role="alert">
                            <span>{actionError}</span>
                            <button onClick={() => setActionError(null)} className="p-0.5 hover:text-red-900" aria-label="Dismiss"><X className="w-4 h-4" /></button>
                        </div>
                    )}
                    {needsMigration && (
                        <div className="px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800">{MIGRATION_HINT}</div>
                    )}
                </div>
            )}

            {/* Summary */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 enter-row">
                <SummaryTile
                    title="Net worth"
                    value={ready ? money(totalNetWorth) : '—'}
                    sub={ready ? `the same as on Wallets · ${plural(walletsWithBalance, 'wallet')} with a balance` : 'loading wallets and rates…'}
                    icon={<Wallet className="w-9 h-9 text-emerald-500" strokeWidth={1.5} />}
                    onClick={() => navigate('/accounts')}
                />
                <SummaryTile
                    title="Saving a month"
                    value={pace ? (pace.perMonth < 0 ? `−${money(-pace.perMonth)}` : money(pace.perMonth)) : '—'}
                    tone={pace && pace.perMonth <= 0 ? 'warn' : 'default'}
                    sub={pace
                        ? <>
                            income minus spending, {monthsLabel(pace.months)}
                            {growth !== null && <span className="hidden md:inline"> · net worth {growth >= 0 ? 'grew' : 'fell'} {money(Math.abs(growth))} a month with rates and interest</span>}
                        </>
                        : 'needs a complete month of operations'}
                    icon={<PiggyBank className="w-9 h-9 text-purple-500" strokeWidth={1.5} />}
                />
                <SummaryTile
                    title="Next goal"
                    value={planReady ? nextTile.value : '—'}
                    tone={planReady && nextTile.value === 'Now' ? 'good' : 'default'}
                    sub={planReady ? nextTile.sub : 'loading…'}
                    icon={<Flag className="w-9 h-9 text-orange-400" strokeWidth={1.5} />}
                />
                <SummaryTile
                    title="Still to save"
                    value={planReady && valued.length > 0 ? money(Math.max(0, need - totalNetWorth)) : '—'}
                    sub={!planReady ? 'loading…' : valued.length > 0
                        ? `for ${plural(open.length, 'open goal')} · your net worth covers ${Math.min(100, Math.floor((totalNetWorth / need) * 100))}%`
                        : 'no open goals'}
                    icon={<Target className="w-9 h-9 text-blue-500" strokeWidth={1.5} />}
                />
            </div>

            {/* Path */}
            {planReady && (series.points.length > 0 || valued.length > 0) && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6">
                    <div className="mb-4">
                        <h3 className="text-base font-semibold text-gray-900">Path to your goals</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {series.points.length > 0 ? 'Solid: net worth week by week, as on Wallets. ' : 'Net worth history appears after importing a backup (.mmbackup). '}
                            {pace && pace.perMonth > 0
                                ? <>Dashed: on from today at <span className="font-medium text-gray-700">{money(pace.perMonth)}</span> a month, with no interest or rate changes.</>
                                : 'No line ahead: spending was ahead of income over these months.'}
                        </p>
                        {(series.isLoading || series.unvalued.length > 0) && (
                            <p className="text-xs text-gray-400 mt-0.5">
                                {series.isLoading && `Loading rates · ${series.weeksLoaded} of ${series.weeks} weeks`}
                                {series.isLoading && series.unvalued.length > 0 && ' · '}
                                {series.unvalued.length > 0 && `No rate for ${series.unvalued.join(', ')}: left out`}
                            </p>
                        )}
                    </div>
                    <GoalsChart
                        points={series.points}
                        netWorth={totalNetWorth}
                        pace={pace?.perMonth ?? null}
                        plans={plans}
                        today={today}
                        isPrivacyMode={isPrivacyMode}
                    />
                </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 px-4 md:px-6 py-2.5 border-b border-gray-100 bg-gray-50/60">
                    <span className="text-xs text-gray-500">{plural(open.length, 'open goal')}</span>
                    <span className="text-xs text-gray-400 hidden sm:inline">· the net worth goes to them in turn: High first, the cheaper one first within a priority</span>
                    {reached.length > 0 && (
                        <button
                            onClick={() => setShowReached(v => !v)}
                            aria-pressed={showReached}
                            className={cn(
                                "ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap",
                                showReached ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                            )}
                            title={showReached ? 'Hide reached goals' : 'Show reached goals'}
                        >
                            <Archive className="w-3.5 h-3.5" />
                            {showReached ? 'Hide reached' : `Reached (${reached.length})`}
                        </button>
                    )}
                </div>
                {plans.length > 0 && (
                    <div className={cn("hidden md:grid items-center gap-x-3 px-6 py-2.5 border-b border-gray-100", GOAL_GRID)}>
                        <div />
                        <HeaderCell>Goal</HeaderCell>
                        <HeaderCell className="text-right">Price</HeaderCell>
                        <HeaderCell>Funded</HeaderCell>
                        <HeaderCell>Reached by</HeaderCell>
                        <div />
                    </div>
                )}

                {(loading || (!ready && open.length > 0)) && (
                    <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading goals…</div>
                )}

                {!loading && ready && groups.map(group => (
                    <div key={group.priority}>
                        <div className="flex items-baseline justify-between gap-3 px-4 md:px-6 py-2.5 bg-gray-50 border-y border-gray-100">
                            <div className="flex items-baseline gap-2 text-sm font-semibold text-gray-800 min-w-0">
                                <span>{PRIORITY_TITLE[group.priority]}</span>
                                <span className="text-xs font-medium text-gray-400">{group.rows.length}</span>
                            </div>
                            <div className="text-sm font-semibold text-gray-700 tabular-nums shrink-0">{money(group.total)}</div>
                        </div>
                        {group.rows.map(plan => (
                            <GoalRow
                                key={plan.goal.id}
                                plan={plan}
                                isPrivacyMode={isPrivacyMode}
                                busy={busyId === plan.goal.id}
                                onEdit={goal => setForm({ goal })}
                                onReached={goal => markReached(goal, today)}
                            />
                        ))}
                    </div>
                ))}

                {!loading && open.length === 0 && (
                    <div className="py-12 flex flex-col items-center justify-center text-gray-400 text-center px-6">
                        <Target className="w-12 h-12 mb-4 opacity-50" />
                        <p className="text-lg font-medium text-gray-500">{reached.length > 0 ? 'Every goal is reached' : 'No goals yet'}</p>
                        <p className="text-sm max-w-md">
                            {userId
                                ? 'Add what you are saving for: a purchase, or a sum to reach. The page works out when your net worth gets there.'
                                : 'Sign in to keep goals.'}
                        </p>
                    </div>
                )}

                {showReached && reached.length > 0 && (
                    <div>
                        <div className="flex items-baseline justify-between gap-3 px-4 md:px-6 py-2.5 bg-gray-50 border-y border-gray-100">
                            <div className="flex items-center gap-2 text-sm font-semibold text-gray-500 min-w-0">
                                <Archive className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">Reached</span>
                                <span className="text-xs font-medium text-gray-400 shrink-0">{reached.length}</span>
                            </div>
                            <div className="text-xs font-medium text-gray-400 shrink-0">not counted in the plan</div>
                        </div>
                        {reached.map(goal => (
                            <ReachedGoalRow
                                key={goal.id}
                                goal={goal}
                                isPrivacyMode={isPrivacyMode}
                                busy={busyId === goal.id}
                                onEdit={g => setForm({ goal: g })}
                                onReopen={g => markReached(g, null)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {form && (
                <GoalFormModal
                    title={form.goal ? 'Edit goal' : 'New goal'}
                    submitLabel={form.goal ? 'Save changes' : 'Add goal'}
                    initial={form.goal ? valuesOf(form.goal) : undefined}
                    rubPerUnit={rubPerUnit}
                    isPrivacyMode={isPrivacyMode}
                    onSubmit={save}
                    // Escape reaches both dialogs; while the delete question is up it only closes that.
                    onClose={() => { if (!toDelete) setForm(null); }}
                    onDelete={form.goal ? () => setToDelete(form.goal) : undefined}
                    onReached={form.goal && !form.goal.reachedOn
                        ? async () => { replace(await setGoalReached(form.goal!.id, today)); setForm(null); }
                        : undefined}
                />
            )}

            <ConfirmDialog
                isOpen={!!toDelete}
                title={toDelete ? `Delete "${toDelete.name.trim()}"?` : ''}
                description="The goal is removed for good. To keep it out of the plan instead, mark it as reached."
                confirmLabel="Delete goal"
                tone="danger"
                isBusy={deleting}
                onConfirm={confirmDelete}
                onCancel={() => setToDelete(null)}
            />
        </div>
    );
}

// The pace's window, switched like the dashboard's period: a white pill slides to the choice.
function PaceTabs({ value, onChange }: { value: PaceWindow; onChange: (v: PaceWindow) => void }) {
    const tabsRef = useRef<HTMLDivElement>(null);
    const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
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
    }, [value]);

    return (
        <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-400 whitespace-nowrap">Pace over</span>
            <div ref={tabsRef} className="relative flex flex-1 sm:flex-none bg-gray-100 p-1 rounded-lg" role="tablist" aria-label="Months the saving pace averages">
                {pill && (
                    <span
                        aria-hidden
                        className="absolute top-1 bottom-1 left-0 rounded-md bg-white shadow-sm transition-[transform,width] duration-300 ease-out"
                        style={{ transform: `translateX(${pill.left}px)`, width: pill.width }}
                    />
                )}
                {WINDOWS.map(w => (
                    <button
                        key={w.months}
                        role="tab"
                        aria-selected={value === w.months}
                        onClick={() => onChange(w.months)}
                        className={cn(
                            "relative flex-1 sm:flex-none px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                            value === w.months ? "text-gray-900" : "text-gray-500 hover:text-gray-900"
                        )}
                    >
                        {w.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function HeaderCell({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn("text-[11px] font-semibold uppercase tracking-wider text-gray-500", className)}>{children}</div>;
}

function SummaryTile({ title, value, sub, icon, tone = 'default', onClick }: {
    title: string; value: string; sub: ReactNode; icon: ReactNode; tone?: 'default' | 'good' | 'warn'; onClick?: () => void;
}) {
    const body = (
        <>
            <div className="flex-1 min-w-0">
                <p className="text-xs md:text-sm font-medium text-gray-500 mb-1 truncate">{title}</p>
                <div className={cn(
                    "text-lg md:text-2xl font-bold tabular-nums truncate",
                    tone === 'good' ? "text-emerald-600" : tone === 'warn' ? "text-amber-600" : "text-gray-900"
                )}>
                    {value}
                </div>
                <p className="text-xs text-gray-400 mt-1 md:mt-1.5 leading-snug">{sub}</p>
            </div>
            <div className="hidden md:block flex-shrink-0 ml-3">{icon}</div>
        </>
    );
    const className = "bg-white p-4 md:p-5 rounded-xl shadow-sm border border-gray-100 flex items-start justify-between text-left w-full min-w-0";
    return onClick
        ? <button type="button" onClick={onClick} className={cn(className, "hover:shadow-md hover:border-emerald-200 transition-all")}>{body}</button>
        : <div className={className}>{body}</div>;
}
