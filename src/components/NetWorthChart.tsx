import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LineChart as LineChartIcon, Table2 } from 'lucide-react';
import type { Milestone, Transaction } from '../types';
import { useNetWorthSeries } from '../hooks/useNetWorthSeries';
import { useUserSettings } from '../contexts/UserSettingsContext';
import type { NetWorthPoint } from '../lib/netWorth';
import { EXPOSURE_COLORS, exposureLabel } from '../lib/exposure';
import { labelIndices, niceScale } from '../lib/chartScale';
import { formatDayKey } from '../lib/milestones';
import { PickedPointLabel } from './ChartParts';
import { MilestoneFlag, MilestoneTooltipLines, MILESTONE_LINE_COLOR } from './MilestoneChartMarks';
import { cn } from '../lib/utils';

interface NetWorthChartProps {
    transactions: Transaction[]; // the statement on this device; the history comes with it
    liveRates: Record<string, number>; // RUB per unit, for the days the rate feed hasn't published
    isPrivacyMode: boolean;
}

const GRID_COLOR = '#EEF0F3';
const LINE_COLOR = '#10b981';
const rub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const monthName = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const monthAndYear = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const dayTime = (day: string) => Date.parse(`${day}T00:00:00Z`);
const short = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${Number((n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1))}M`;
    if (abs >= 1_000) return `${Math.round(n / 1_000)}k`;
    return String(Math.round(n));
};

/** The first of every month the chart spans, as axis ticks. */
function monthTicks(first: string, last: string): number[] {
    const ticks: number[] = [];
    const d = new Date(`${first.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 1);
    while (d.toISOString().slice(0, 10) <= last) {
        ticks.push(d.getTime());
        d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return ticks;
}

/**
 * Net worth week by week, from the balances a backup of the expense app carries: every wallet
 * valued at that week's rate. Milestones stand on it as flags; a table gives it month by month.
 */
export function NetWorthChart({ transactions, liveRates, isPrivacyMode }: NetWorthChartProps) {
    const navigate = useNavigate();
    const { settings } = useUserSettings();
    const [asTable, setAsTable] = useState(false);

    const { history, firstDay, lastDay, points, unvalued, isLoading, weeks, weeksLoaded } = useNetWorthSeries(transactions, liveRates);

    const data = useMemo(() => points.map(p => ({ t: dayTime(p.day), total: p.total, point: p })), [points]);
    const { domain, ticks } = useMemo(() => niceScale(Math.min(0, ...points.map(p => p.total)), Math.max(0, ...points.map(p => p.total))), [points]);
    const picked = useMemo(() => labelIndices(points.map(p => p.total), { minGap: 4 }), [points]);
    const xTicks = useMemo(() => (firstDay && lastDay ? monthTicks(firstDay, lastDay) : []), [firstDay, lastDay]);

    // Milestones inside the span, each on its own day; a point's tooltip lists those of its week.
    const milestones = useMemo(
        () => (settings.preferences.milestones ?? []).filter(m => m.date >= firstDay && m.date <= lastDay),
        [settings.preferences.milestones, firstDay, lastDay]
    );
    const weekOf = (index: number): Milestone[] =>
        milestones.filter(m => m.date <= points[index].day && (index === 0 || m.date > points[index - 1].day));
    const openMilestone = (m: Milestone) => navigate('/milestones', { state: { focusMilestone: m.date } });

    const months = useMemo(() => {
        // Each month's last point, newest first, with the change from the month before.
        const ends = new Map<string, NetWorthPoint>();
        for (const p of points) ends.set(p.day.slice(0, 7), p);
        const list = [...ends.values()];
        return list.map((p, i) => ({ point: p, change: i > 0 ? p.total - list[i - 1].total : null })).reverse();
    }, [points]);

    const money = (n: number) => (isPrivacyMode ? '••••••' : rub.format(n));

    if (!history) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-4 flex items-center gap-3 text-sm text-gray-500">
                <LineChartIcon className="w-5 h-5 text-gray-300 shrink-0" />
                Net worth over time appears after importing a backup from the expense app (a .mmbackup file): an Excel export has no balances.
            </div>
        );
    }

    const change = points.length > 1 ? points[points.length - 1].total - points[0].total : 0;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900">Net worth over time</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Week by week since {formatDayKey(firstDay)}, every wallet at that week's rate
                        {points.length > 1 && <> · <span className="font-medium text-gray-700">{change >= 0 ? '+' : '−'}{money(Math.abs(change))}</span> over the span</>}
                    </p>
                    {(isLoading || unvalued.length > 0) && (
                        <p className="text-xs text-gray-400 mt-0.5">
                            {isLoading && `Loading rates · ${weeksLoaded} of ${weeks} weeks`}
                            {isLoading && unvalued.length > 0 && ' · '}
                            {unvalued.length > 0 && `No rate for ${unvalued.join(', ')}: left out`}
                        </p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => setAsTable(v => !v)}
                    aria-pressed={asTable}
                    className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap",
                        asTable ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    )}
                    title={asTable ? 'Show the chart' : 'Show month by month as a table'}
                >
                    {asTable ? <LineChartIcon className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
                    {asTable ? 'Chart' : 'Table'}
                </button>
            </div>

            {asTable ? (
                <div className="max-h-72 overflow-y-auto -mx-1">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white">
                            <tr className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 text-left">
                                <th className="px-1 py-1.5 font-semibold">Month end</th>
                                <th className="px-1 py-1.5 font-semibold text-right">Net worth</th>
                                <th className="px-1 py-1.5 font-semibold text-right">Change</th>
                            </tr>
                        </thead>
                        <tbody className="tabular-nums">
                            {months.map(({ point, change: delta }) => (
                                <tr key={point.day} className="border-t border-gray-100">
                                    <td className="px-1 py-1.5 text-gray-700">{monthAndYear.format(new Date(dayTime(point.day)))}</td>
                                    <td className="px-1 py-1.5 text-right text-gray-900 font-medium">{money(point.total)}</td>
                                    <td className="px-1 py-1.5 text-right text-gray-500">
                                        {delta === null ? '—' : `${delta >= 0 ? '+' : '−'}${money(Math.abs(delta))}`}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="h-56 md:h-72">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <AreaChart data={data} margin={{ top: milestones.length ? 20 : 12, right: 12, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
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
                                interval="preserveStartEnd"
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
                                    const row = active && payload?.[0]?.payload as { point: NetWorthPoint } | undefined;
                                    if (!row) return null;
                                    const index = points.indexOf(row.point);
                                    return <NetWorthTooltip point={row.point} milestones={index >= 0 ? weekOf(index) : []} money={money} />;
                                }}
                            />
                            {milestones.map(m => (
                                <ReferenceLine
                                    key={m.id}
                                    x={dayTime(m.date)}
                                    stroke={MILESTONE_LINE_COLOR}
                                    strokeDasharray="4 3"
                                    label={<MilestoneFlag mark={{ month: m.date.slice(0, 7), label: m.date, milestones: [m], position: 'start' }} onOpen={openMilestone} />}
                                />
                            ))}
                            <Area
                                type="monotone"
                                dataKey="total"
                                name="Net worth"
                                stroke={LINE_COLOR}
                                strokeWidth={2}
                                fill="url(#netWorthFill)"
                                fillOpacity={1}
                                activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
                                isAnimationActive={false}
                            >
                                <LabelList content={<PickedPointLabel picked={picked} format={v => (isPrivacyMode ? '' : short(v))} />} />
                            </Area>
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}

// One point: the total first, then where it sat by currency (largest first), then the week's milestones.
function NetWorthTooltip({ point, milestones, money }: { point: NetWorthPoint; milestones: Milestone[]; money: (n: number) => string }) {
    const groups = Object.entries(point.byGroup).filter(([, v]) => Math.abs(v) >= 0.5).sort(([, a], [, b]) => b - a);
    return (
        <div className="bg-white/95 backdrop-blur-sm p-3 rounded-xl shadow-xl border border-gray-100 flex flex-col gap-2 min-w-[180px]">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-1.5">{formatDayKey(point.day)}</p>
            <div className="flex items-baseline justify-between gap-4">
                <span className="text-xs font-medium text-gray-500">Net worth</span>
                <span className="text-sm font-bold text-gray-900">{money(point.total)}</span>
            </div>
            <div className="flex flex-col gap-1">
                {groups.map(([group, value]) => (
                    <div key={group} className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-xs text-gray-500">
                            <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: EXPOSURE_COLORS[group] }} />
                            {exposureLabel(group)}
                        </span>
                        <span className="text-xs font-semibold text-gray-700 tabular-nums">{money(value)}</span>
                    </div>
                ))}
            </div>
            {milestones.length > 0 && (
                <div className="border-t border-gray-50 pt-1.5">
                    <MilestoneTooltipLines milestones={milestones} />
                </div>
            )}
        </div>
    );
}
