import { useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { NetWorthPoint } from '../lib/netWorth';
import { addMonths, DEFAULT_GOAL_ICON, type GoalPlan } from '../lib/goals';
import { niceScale } from '../lib/chartScale';
import { formatDayKey } from '../lib/milestones';
import { monthLabel } from '../lib/periods';

interface GoalsChartProps {
    points: NetWorthPoint[]; // the Wallets chart's weekly net worth; empty without a backup
    netWorth: number;        // today, as the Net worth tile shows it
    pace: number | null;     // rubles a month
    plans: GoalPlan[];       // open goals, in the order the net worth goes to them
    today: string;           // "YYYY-MM-DD"
    isPrivacyMode: boolean;
}

const GRID_COLOR = '#EEF0F3';
const LINE_COLOR = '#10b981';
const GOAL_LINE_COLOR = '#9CA3AF';
const MAX_MONTHS_SHOWN = 30 * 12;

const rub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const monthName = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const dayTime = (day: string) => Date.parse(`${day}T00:00:00Z`);
const short = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${Number((n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1))}M`;
    if (abs >= 1_000) return `${Math.round(n / 1_000)}k`;
    return String(Math.round(n));
};

type Row = { t: number; day: string; actual?: number; projected?: number };

/** Axis ticks: the first of every quarter over a short span, every New Year's day over a long one. */
function timeTicks(first: string, last: string): number[] {
    const quarterly = dayTime(last) - dayTime(first) < 2.5 * 365 * 86_400_000;
    const ticks: number[] = [];
    const d = new Date(`${first.slice(0, 7)}-01T00:00:00Z`);
    for (d.setUTCMonth(d.getUTCMonth() + 1); d.toISOString().slice(0, 10) <= last; d.setUTCMonth(d.getUTCMonth() + 1)) {
        if (quarterly ? d.getUTCMonth() % 3 === 0 : d.getUTCMonth() === 0) ticks.push(d.getTime());
    }
    return ticks;
}

/**
 * Where the net worth is heading: the weekly line from the Wallets page, then a dashed line on
 * from today at the saving pace. Each goal is a level the line has to reach — the goals before it
 * included — with a dot where it gets there.
 */
export function GoalsChart({ points, netWorth, pace, plans, today, isPrivacyMode }: GoalsChartProps) {
    const money = (n: number) => (isPrivacyMode ? '••••••' : rub.format(n));

    // Each valued goal's level: what it and every goal before it need.
    const levels = useMemo(
        () => plans.filter(p => p.costRub !== null).map(p => ({ plan: p, level: p.ahead + p.costRub! })),
        [plans]
    );

    const growing = pace !== null && pace > 0;
    const horizon = useMemo(() => {
        if (!growing) return 0;
        const furthest = Math.max(0, ...plans.filter(p => p.date).map(p => p.monthsAway!));
        // A little room past the last dot, a year ahead when no goal has a date.
        return Math.min(MAX_MONTHS_SHOWN, furthest > 0 ? Math.ceil(furthest + Math.max(2, furthest * 0.08)) : 12);
    }, [growing, plans]);

    const rows = useMemo<Row[]>(() => {
        const history: Row[] = points.map(p => ({ t: dayTime(p.day), day: p.day, actual: p.total }));
        if (!growing) return history;
        const ahead: Row[] = [];
        for (let m = 0; m <= horizon; m++) {
            const day = m === 0 ? today : addMonths(today, m);
            ahead.push({ t: dayTime(day), day, projected: netWorth + pace! * m });
        }
        return [...history, ...ahead];
    }, [points, growing, horizon, today, netWorth, pace]);

    const firstDay = points[0]?.day ?? today;
    const lastDay = growing ? addMonths(today, horizon) : addMonths(today, 1);
    const xTicks = useMemo(() => timeTicks(firstDay, lastDay), [firstDay, lastDay]);
    const { domain, ticks } = useMemo(() => {
        const values = [netWorth, ...rows.map(r => r.actual ?? r.projected ?? 0), ...levels.map(l => l.level)];
        return niceScale(Math.min(0, ...values), Math.max(0, ...values));
    }, [rows, levels, netWorth]);

    // A goal's name sits on its line at the left, and its month over its dot. A goal whose level
    // would put either label on top of the one below keeps its line and dot unlabelled: the
    // table and the tooltip still name it.
    const named = useMemo(() => {
        const keep = new Set<string>();
        let last = -Infinity;
        const span = domain[1] - domain[0] || 1;
        for (const l of [...levels].sort((a, b) => a.level - b.level)) {
            if ((l.level - last) / span >= 0.08) {
                keep.add(l.plan.goal.id);
                last = l.level;
            }
        }
        return keep;
    }, [levels, domain]);

    return (
        <div className="h-56 md:h-72">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <ComposedChart data={rows} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="goalsNetWorthFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={LINE_COLOR} stopOpacity={0.2} />
                            <stop offset="95%" stopColor={LINE_COLOR} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={GRID_COLOR} />
                    <XAxis
                        dataKey="t"
                        type="number"
                        scale="time"
                        domain={[dayTime(firstDay), dayTime(lastDay)]}
                        ticks={xTicks}
                        tickFormatter={(t: number) => {
                            const d = new Date(t);
                            return d.getUTCMonth() === 0 ? String(d.getUTCFullYear()) : monthName.format(d);
                        }}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#6B7280', fontSize: 12 }}
                        dy={10}
                        minTickGap={8}
                    />
                    <YAxis
                        domain={domain}
                        ticks={ticks}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#6B7280', fontSize: 12 }}
                        width={52}
                        tickFormatter={(v: number) => (isPrivacyMode ? '•••' : `₽${short(v)}`)}
                    />
                    <Tooltip
                        cursor={{ stroke: '#D1D5DB', strokeWidth: 1 }}
                        content={({ active, payload }) => {
                            const row = active ? (payload?.[0]?.payload as Row | undefined) : undefined;
                            if (!row) return null;
                            const value = row.actual ?? row.projected;
                            if (value === undefined) return null;
                            const covered = row.projected !== undefined ? levels.filter(l => l.level <= value) : [];
                            return (
                                <div className="bg-white/95 backdrop-blur-sm p-3 rounded-xl shadow-xl border border-gray-100 flex flex-col gap-1.5 min-w-[180px]">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-1.5">
                                        {row.actual !== undefined ? formatDayKey(row.day) : monthLabel(row.day.slice(0, 7), 'short')}
                                    </p>
                                    <div className="flex items-baseline justify-between gap-4">
                                        <span className="text-xs font-medium text-gray-500">{row.actual !== undefined ? 'Net worth' : 'At your pace'}</span>
                                        <span className="text-sm font-bold text-gray-900">{money(value)}</span>
                                    </div>
                                    {covered.length > 0 && (
                                        <p className="text-xs text-gray-500 max-w-[220px]">
                                            Enough for {covered.map(l => `${l.plan.goal.icon ?? DEFAULT_GOAL_ICON} ${l.plan.goal.name}`).join(', ')}
                                        </p>
                                    )}
                                </div>
                            );
                        }}
                    />
                    {levels.map(({ plan, level }) => (
                        <ReferenceLine
                            key={plan.goal.id}
                            y={level}
                            stroke={GOAL_LINE_COLOR}
                            strokeDasharray="4 4"
                            label={named.has(plan.goal.id) ? {
                                value: `${plan.reachedNow ? '✓ ' : ''}${plan.goal.icon ?? DEFAULT_GOAL_ICON} ${plan.goal.name}`,
                                position: 'insideTopLeft',
                                fill: '#4B5563',
                                fontSize: 11,
                                fontWeight: 600,
                            } : undefined}
                        />
                    ))}
                    <Area
                        type="monotone"
                        dataKey="actual"
                        name="Net worth"
                        stroke={LINE_COLOR}
                        strokeWidth={2}
                        fill="url(#goalsNetWorthFill)"
                        fillOpacity={1}
                        activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
                        isAnimationActive={false}
                    />
                    {growing && (
                        <Line
                            type="linear"
                            dataKey="projected"
                            name="At your pace"
                            stroke={LINE_COLOR}
                            strokeWidth={2}
                            strokeDasharray="6 5"
                            dot={false}
                            activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
                            isAnimationActive={false}
                        />
                    )}
                    {levels.filter(l => l.plan.date && !l.plan.reachedNow && l.plan.monthsAway! <= horizon).map(({ plan, level }) => (
                        <ReferenceDot
                            key={plan.goal.id}
                            x={dayTime(plan.date!)}
                            y={level}
                            r={5}
                            fill={LINE_COLOR}
                            stroke="#fff"
                            strokeWidth={2}
                            label={named.has(plan.goal.id)
                                ? { value: monthLabel(plan.date!.slice(0, 7), 'short'), position: 'top', fill: '#374151', fontSize: 11, fontWeight: 600 }
                                : undefined}
                        />
                    ))}
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}
