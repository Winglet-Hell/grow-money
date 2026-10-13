import React, { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList, ReferenceLine, Rectangle,
    type BarRectangleItem, type LabelProps
} from 'recharts';
import type { Transaction } from '../types';
import { usePrivacy } from '../contexts/PrivacyContext';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { getCategoryIcon, getCategoryColor } from '../lib/categoryIcons';
import { isPlannedPayment } from '../lib/categoryGroups';
import { CustomTooltip } from './CustomTooltip';
import { TransactionListModal } from './TransactionListModal';
import { filterByPeriod, monthKeyOf, monthKeyFromDate, monthLabel, summarizePeriod, type DashboardPeriod } from '../lib/periods';
import { cn } from '../lib/utils';

interface ChartsProps {
    transactions: Transaction[];
    period: DashboardPeriod;
    budget?: number;                          // monthly target line (sum of category limits)
    budgetReady?: boolean;                    // false while the limits are still loading
    limits?: Record<string, number>;          // monthly limit per category, marked on the bars of a month
    onSelectMonth?: (key: string) => void;    // click on a month bar scopes the dashboard to it
}

const formatCompact = (num: any) => {
    if (typeof num !== 'number') return '';
    return new Intl.NumberFormat('en-US', {
        notation: "compact",
        maximumFractionDigits: 0
    }).format(num);
};

const GREEN = '#10B981';
const AMBER = '#F59E0B';
const RED = '#EF4444';
const GRAY = '#cbd5e1'; // the running month, not over yet
// The same three darkened for text and thin lines, which the fills are too light for on white.
const INK: Record<string, string> = { [GREEN]: '#047857', [AMBER]: '#b45309', [RED]: '#dc2626' };

// A month's colour says how it went against the monthly target: within it, a little over (up
// to a quarter more), or well over. Without a target, against the most expensive month.
const monthColor = (total: number, budget: number, max: number) => {
    if (budget > 0) return total <= budget ? GREEN : total <= budget * 1.25 ? AMBER : RED;
    const ratio = total / max;
    return ratio < 0.5 ? GREEN : ratio < 0.8 ? AMBER : RED;
};

/** A month on the trend chart. Planned are the big payments: rent, trips, electronics, visas, insurance, taxes. */
interface MonthPoint {
    key: string;
    name: string; // "Oct ’26"
    everyday: number;
    planned: number;
    total: number;
    projected?: number; // the running month: where it is heading by its last day
    ahead: number;      // projected − total, the dashed part of the running month's bar
}

// Bottom to top. A part is the top of its bar when every part above it is empty.
const MONTH_PARTS = ['everyday', 'planned', 'ahead'] as const;
const isTopPart = (part: typeof MONTH_PARTS[number], m: MonthPoint | undefined) =>
    MONTH_PARTS.slice(MONTH_PARTS.indexOf(part) + 1).every(above => !m?.[above]);

const rubles = (n: number) => `₽${Math.round(n).toLocaleString('ru-RU')}`;
// A white outline under the amounts above the month bars: where the target line runs through
// one, it breaks around the digits instead of striking them out.
const LABEL_HALO = { stroke: '#ffffff', strokeWidth: 4, strokeLinejoin: 'round', paintOrder: 'stroke' } as const;
const NO_LIMITS: Record<string, number> = {};

// The legend's and the tooltip's stand-in for the striped planned part of a bar.
const PLANNED_SWATCH = 'repeating-linear-gradient(45deg, #9ca3af 0 2px, #e5e7eb 2px 4px)';
const FORECAST_SWATCH = 'w-2.5 h-2.5 rounded-sm border border-dashed border-gray-400';
// The category chart's legend: a pale column for the limit, white stripes over what went past it.
const OVER_LIMIT_SWATCH = 'repeating-linear-gradient(45deg, #6b7280 0 2px, #e5e7eb 2px 4px)';

const MonthTooltip = ({ active, payload, isPrivacy, budget, currentMonthKey }: {
    active?: boolean; payload?: { payload: MonthPoint }[]; isPrivacy: boolean; budget: number; currentMonthKey: string;
}) => {
    const m = active ? payload?.[0]?.payload : undefined;
    if (!m) return null;
    const money = (n: number) => (isPrivacy ? '••••••' : rubles(n));
    const row = (label: string, value: string, swatch?: React.ReactNode, strong = false) => (
        <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
                {swatch}
                <span className={strong ? "text-xs font-semibold text-gray-700" : "text-xs font-medium text-gray-500"}>{label}</span>
            </div>
            <span className="text-xs font-bold text-gray-900 tabular-nums">{value}</span>
        </div>
    );
    return (
        <div className="bg-white/95 backdrop-blur-sm p-3 rounded-xl shadow-xl border border-gray-100 flex flex-col gap-1.5 min-w-[170px]">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-1.5 mb-0.5">
                {monthLabel(m.key)}{m.key === currentMonthKey ? ' · so far' : ''}
            </p>
            {row('Everyday', money(m.everyday), <span className="w-2.5 h-2.5 rounded-sm bg-gray-400" />)}
            {row('Planned', money(m.planned), <span className="w-2.5 h-2.5 rounded-sm" style={{ background: PLANNED_SWATCH }} />)}
            <div className="border-t border-gray-50 pt-1.5 flex flex-col gap-1">
                {row(m.projected ? 'Total so far' : 'Total', money(m.total), undefined, true)}
                {m.projected !== undefined && row('Month-end ≈', money(m.projected), <span className={FORECAST_SWATCH} />, true)}
                {budget > 0 && (
                    <p className="text-[11px] text-gray-400 tabular-nums">
                        {isPrivacy ? 'vs target' : `${Math.round(((m.projected ?? m.total) / budget) * 100)}% of the ${rubles(budget)} target${m.projected ? ' at this pace' : ''}`}
                    </p>
                )}
            </div>
        </div>
    );
};

// A category bar gets 80px, so its name goes on up to two lines of at most this width
// ("Local / transport"), measured in the label's own font.
const LABEL_WIDTH = 76;
let measureContext: CanvasRenderingContext2D | null | undefined;
const fitsLabel = (text: string) => {
    if (measureContext === undefined) {
        measureContext = document.createElement('canvas').getContext('2d');
        if (measureContext) measureContext.font = '12px Inter, sans-serif';
    }
    return (measureContext ? measureContext.measureText(text).width : text.length * 6.5) <= LABEL_WIDTH;
};

const VOWEL = /[aeiouyаеёиоуыэюя]/i;
const LETTER = /\p{L}/u;

// A word too long for a line breaks with a hyphen, as late as still fits, and between
// syllables when one fits (vowel | consonant + vowel: "Accommo-dation").
function hyphenate(word: string): [string, string] {
    let syllableCut = 0;
    let lastCut = 0;
    for (let i = 2; i <= word.length - 3 && fitsLabel(`${word.slice(0, i)}-`); i++) {
        lastCut = i;
        if (VOWEL.test(word[i - 1]) && LETTER.test(word[i]) && !VOWEL.test(word[i]) && VOWEL.test(word[i + 1])) syllableCut = i;
    }
    const cut = syllableCut || lastCut;
    return cut ? [`${word.slice(0, cut)}-`, word.slice(cut)] : [word, ''];
}

function wrapLabel(name: string): string[] {
    const lines: string[] = [];
    let current = '';
    for (const word of name.split(/\s+/).filter(Boolean)) {
        const joined = current ? `${current} ${word}` : word;
        if (fitsLabel(joined)) {
            current = joined;
            continue;
        }
        if (current) lines.push(current);
        if (fitsLabel(word)) {
            current = word;
        } else {
            const [head, tail] = hyphenate(word);
            lines.push(head);
            current = tail;
        }
    }
    if (current) lines.push(current);
    if (lines.length === 1 || (lines.length === 2 && fitsLabel(lines[1]))) return lines;
    // Two lines is all there is room for: the second one ends in an ellipsis.
    let second = lines.slice(1).join(' ');
    while (second.length > 1 && !fitsLabel(`${second}…`)) second = second.slice(0, -1);
    return [lines[0], `${second.trimEnd()}…`];
}

const CustomXAxisTick = (props: any) => {
    const { x, y, payload } = props;
    const Icon = getCategoryIcon(payload.value);

    return (
        <g transform={`translate(${x},${y})`}>
            <foreignObject x={-12} y={0} width={24} height={24}>
                <div className="flex items-center justify-center w-full h-full text-gray-500">
                    <Icon size={16} />
                </div>
            </foreignObject>
            <text x={0} y={32} textAnchor="middle" fill="#6B7280" fontSize={12}>
                {wrapLabel(payload.value).map((line, i) => (
                    <tspan key={i} x={0} dy={i === 0 ? 0 : 14}>{line}</tspan>
                ))}
            </text>
        </g>
    );
};

export const Charts: React.FC<ChartsProps> = React.memo(({ transactions, period, budget = 0, budgetReady = true, limits = NO_LIMITS, onSelectMonth }) => {
    const { isPrivacyMode } = usePrivacy();
    // Bars move to their new heights when the period changes — unless the system asks for less
    // motion. Not when the page opens or the limits arrive: that ran 400ms of script per chart
    // just as the page was being scrolled.
    const reducedMotion = usePrefersReducedMotion();
    const periodKey = period.kind === 'all' ? 'all' : period.key;
    const [shownPeriodKey, setShownPeriodKey] = useState(periodKey);
    const [periodChanged, setPeriodChanged] = useState(false);
    if (periodKey !== shownPeriodKey) {
        setShownPeriodKey(periodKey);
        setPeriodChanged(true);
    }
    const barMotion = { isAnimationActive: periodChanged && !reducedMotion, animationDuration: 400, animationEasing: 'ease-out' } as const;

    const periodTitle = period.kind === 'all' ? 'All time' : monthLabel(period.key);

    const expensesByCategory = useMemo(() => {
        const categories: Record<string, number> = {};

        filterByPeriod(transactions, period)
            .filter(t => t.type === 'expense') // expenses only
            .forEach(t => {
                const cat = t.category || 'Other';
                const amount = Math.abs(t.amount);
                categories[cat] = (categories[cat] || 0) + amount;
            });

        return Object.entries(categories)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [transactions, period]);

    // Where the running month is heading: spent so far plus what finished months usually spent
    // after this day — the same month-end figure as the pace card above.
    const currentMonthKey = monthKeyFromDate(new Date());
    const projectedThisMonth = useMemo(
        () => summarizePeriod(transactions, { kind: 'month', key: currentMonthKey }).projectedExpenses,
        [transactions, currentMonthKey]
    );

    // Each month splits into everyday spending and the big planned payments stacked on top, so
    // a month made expensive by a phone or a trip doesn't read like a month of overspending.
    const monthlySpending = useMemo<MonthPoint[]>(() => {
        const months = new Map<string, { everyday: number; planned: number }>();
        for (const t of transactions) {
            if (t.type !== 'expense') continue;
            const key = monthKeyOf(t.date);
            if (!key) continue;
            const month = months.get(key) ?? { everyday: 0, planned: 0 };
            if (isPlannedPayment(t.category)) month.planned += Math.abs(t.amount);
            else month.everyday += Math.abs(t.amount);
            months.set(key, month);
        }
        // Oldest first: time runs left to right, and the chart opens scrolled to the newest month.
        return [...months.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([key, m]) => {
                const total = m.everyday + m.planned;
                const projected = key === currentMonthKey && projectedThisMonth !== undefined && projectedThisMonth > total
                    ? projectedThisMonth
                    : undefined;
                return {
                    key,
                    name: monthLabel(key, 'short').replace(/ \d{2}(\d{2})$/, ' ’$1'), // "Sep ’26"; "Sep 26" read as a day
                    everyday: m.everyday,
                    planned: m.planned,
                    total,
                    projected,
                    ahead: projected !== undefined ? projected - total : 0,
                };
            });
    }, [transactions, currentMonthKey, projectedThisMonth]);

    // The max for colours without a target
    const maxValue = useMemo(() => Math.max(...monthlySpending.map(m => m.total), 0), [monthlySpending]);
    // Until the target has loaded the months stay gray, rather than coloured against the wrong yardstick.
    const colourOf = (total: number) => (budgetReady ? monthColor(total, budget, maxValue) : GRAY);
    const hasForecast = monthlySpending.some(m => m.ahead > 0);

    const trendScrollRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const el = trendScrollRef.current;
        if (el) el.scrollLeft = el.scrollWidth;
    }, [monthlySpending.length]);

    // Stripes for the planned part of a bar, one per colour a month can take.
    const stripesPrefix = `planned-${useId().replace(/[^\w-]/g, '')}`;
    const stripes = (color: string) => `url(#${stripesPrefix}-${color.slice(1)})`;

    const selectedKey = period.kind === 'month' ? period.key : null;

    // A category bar opens the payments behind it, for the period on show.
    const [openCategory, setOpenCategory] = useState<string | null>(null);
    const openCategoryRows = useMemo(
        () => (openCategory
            ? filterByPeriod(transactions, period).filter(t => t.type === 'expense' && (t.category || 'Other') === openCategory)
            : []),
        [openCategory, transactions, period]
    );
    // Room under the category bars for a second line, when some name needs one.
    const twoLineLabels = useMemo(() => expensesByCategory.some(c => wrapLabel(c.name).length > 1), [expensesByCategory]);

    // Limits are monthly, so they are marked only while one month is on show.
    const limitOf = (category: string) => (period.kind === 'month' ? limits[category] : undefined);
    const highestLimit = Math.max(0, ...expensesByCategory.map(c => limitOf(c.name) ?? 0));

    return (
        // One above the other at every width: side by side, each got half the row and showed
        // only five bars before scrolling.
        <div className="grid grid-cols-1 gap-8 mb-8">
            {/* Category Bar Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col h-96">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-6 flex-shrink-0">
                    <h3 className="text-lg font-semibold text-gray-800">Expenses by Category</h3>
                    <div className="flex items-center gap-3 text-xs font-medium text-gray-400 whitespace-nowrap">
                        {highestLimit > 0 && (
                            <>
                                <span className="flex items-center gap-1.5" title="The pale column behind a bar is the category's monthly limit">
                                    <span className="w-2.5 h-2.5 rounded-sm bg-gray-200" />
                                    Limit
                                </span>
                                <span className="flex items-center gap-1.5" title="The striped top of a bar is what went past the limit">
                                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: OVER_LIMIT_SWATCH }} />
                                    Over
                                </span>
                            </>
                        )}
                        <span>
                            {periodTitle}
                            <span className="hidden sm:inline"> · Click a category to see its payments</span>
                        </span>
                    </div>
                </div>
                <div className="flex-1 overflow-x-auto pb-2 min-h-0">
                    {expensesByCategory.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                            No expenses in this period
                        </div>
                    ) : (
                        <div style={{ minWidth: '100%', width: Math.max(expensesByCategory.length * 80, 300), height: '100%' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={expensesByCategory} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
                                    <defs>
                                        <pattern id={`${stripesPrefix}-over`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                                            <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" strokeWidth="2.5" strokeOpacity="0.6" />
                                        </pattern>
                                    </defs>
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        interval={0}
                                        tick={<CustomXAxisTick />}
                                        height={twoLineLabels ? 64 : 50}
                                    />
                                    {/* Tall enough for a limit above every bar. */}
                                    <YAxis hide domain={[0, (dataMax: number) => Math.max(dataMax, highestLimit)]} />
                                    <Tooltip
                                        content={
                                            <CustomTooltip
                                                isPrivacy={isPrivacyMode}
                                                footer={(category: string) => {
                                                    const limit = limitOf(category);
                                                    const spent = expensesByCategory.find(c => c.name === category)?.value;
                                                    if (!limit || spent === undefined) return null;
                                                    return (
                                                        <p className={cn("text-[11px] tabular-nums", spent > limit ? "text-red-600" : "text-gray-400")}>
                                                            {isPrivacyMode ? 'vs limit' : `${Math.round((spent / limit) * 100)}% of the ${rubles(limit)} limit`}
                                                        </p>
                                                    );
                                                }}
                                            />
                                        }
                                        cursor={{ fill: 'rgba(249, 250, 251, 0.5)' }}
                                    />
                                    <Bar
                                        dataKey="value"
                                        name="Spent"
                                        barSize={48}
                                        {...barMotion}
                                        cursor="pointer"
                                        onClick={(data: BarRectangleItem) => {
                                            const name = (data.payload as { name?: string } | undefined)?.name;
                                            if (name) setOpenCategory(name);
                                        }}
                                        // The bar and the amount above it. With a limit, a pale column behind the bar
                                        // shows the room left in it, and stripes mark what went past it.
                                        shape={(props: unknown) => {
                                            const bar = props as BarRectangleItem;
                                            const entry = bar.payload as { name: string; value: number } | undefined;
                                            const limit = entry ? limitOf(entry.name) : undefined;
                                            const base = bar.y + bar.height;
                                            const limitY = limit && entry && bar.height > 0 ? base - (limit / entry.value) * bar.height : undefined;
                                            const over = limitY !== undefined && limitY > bar.y;
                                            return (
                                                <g>
                                                    {limitY !== undefined && !over && (
                                                        <Rectangle x={bar.x} y={limitY} width={bar.width} height={base - limitY} radius={[8, 8, 0, 0]} fill={bar.fill} fillOpacity={0.16} />
                                                    )}
                                                    <Rectangle {...bar} radius={[8, 8, 0, 0]} />
                                                    {over && (
                                                        <Rectangle x={bar.x} y={bar.y} width={bar.width} height={limitY - bar.y} radius={[8, 8, 0, 0]} fill={`url(#${stripesPrefix}-over)`} />
                                                    )}
                                                    {entry && !isPrivacyMode && (
                                                        <text
                                                            x={bar.x + bar.width / 2}
                                                            y={bar.y - 6}
                                                            textAnchor="middle"
                                                            fontSize={12}
                                                            fontWeight={over ? 600 : 500}
                                                            fill={over ? '#dc2626' : '#6b7280'}
                                                        >
                                                            {formatCompact(entry.value)}
                                                        </text>
                                                    )}
                                                </g>
                                            );
                                        }}
                                    >
                                        {expensesByCategory.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={getCategoryColor(entry.name).hex} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>

            {/* Monthly Bar Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col h-96">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-6 flex-shrink-0">
                    <h3 className="text-lg font-semibold text-gray-800">Monthly Spending Trend</h3>
                    <div className="flex items-center gap-3 text-xs font-medium text-gray-400 whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-sm bg-gray-400" />
                            Everyday
                        </span>
                        <span className="flex items-center gap-1.5" title="Rent, stays and tickets, travel packages, electronics, visas, insurance and taxes">
                            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: PLANNED_SWATCH }} />
                            Planned
                        </span>
                        {hasForecast && (
                            <span className="flex items-center gap-1.5" title="Where this month is heading: spent so far plus what past months usually spent after this day">
                                <span className={FORECAST_SWATCH} />
                                Month-end
                            </span>
                        )}
                        {onSelectMonth && <span className="hidden sm:inline">· Click a month to focus</span>}
                    </div>
                </div>
                <div ref={trendScrollRef} className="flex-1 overflow-x-auto pb-2">
                    <div style={{ minWidth: '100%', width: Math.max(monthlySpending.length * 80, 300), height: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            {/* Room for the Target label from the start: making it when the limits
                                arrived moved every bar and redrew the chart. */}
                            <BarChart data={monthlySpending} margin={{ top: 20, right: budgetReady && budget === 0 ? 10 : 52, left: 10, bottom: 5 }}>
                                <defs>
                                    {[GREEN, AMBER, RED, GRAY].map(color => (
                                        <pattern key={color} id={`${stripesPrefix}-${color.slice(1)}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                                            <rect width="6" height="6" fill={color} fillOpacity={0.35} />
                                            <line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth="2.5" />
                                        </pattern>
                                    ))}
                                </defs>
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    interval={0}
                                    tick={{ fontSize: 12, fill: '#6B7280' }}
                                />
                                <YAxis hide />
                                <Tooltip
                                    content={<MonthTooltip isPrivacy={isPrivacyMode} budget={budget} currentMonthKey={currentMonthKey} />}
                                    cursor={{ fill: 'rgba(249, 250, 251, 0.5)' }}
                                />
                                {budget > 0 && (
                                    <ReferenceLine
                                        y={budget}
                                        stroke="#f97316"
                                        strokeDasharray="4 4"
                                        strokeWidth={2}
                                        ifOverflow="extendDomain"
                                        // Past the last bar, where the chart opens: on the left it scrolled out of view.
                                        label={({ viewBox }: any) => (
                                            <text x={viewBox.x + viewBox.width + 6} y={viewBox.y + 4} fill="#f97316" fontSize={12} fontWeight={600}>
                                                Target
                                            </text>
                                        )}
                                    />
                                )}
                                {MONTH_PARTS.map(part => (
                                    <Bar
                                        key={part}
                                        dataKey={part}
                                        name={part === 'everyday' ? 'Everyday' : part === 'planned' ? 'Planned' : 'Month-end'}
                                        stackId="month"
                                        barSize={48}
                                        {...barMotion}
                                        cursor={onSelectMonth ? 'pointer' : undefined}
                                        onClick={(entry: any) => {
                                            const key = entry?.key ?? entry?.payload?.key;
                                            if (key && onSelectMonth) onSelectMonth(key);
                                        }}
                                        // Only the top of the stack is rounded.
                                        shape={(props: unknown) => {
                                            const bar = props as BarRectangleItem;
                                            return <Rectangle {...bar} radius={isTopPart(part, bar.payload as MonthPoint | undefined) ? [8, 8, 0, 0] : 0} />;
                                        }}
                                    >
                                        {part === 'planned' && (
                                            <LabelList
                                                dataKey="total"
                                                position="top"
                                                formatter={(val: any) => isPrivacyMode ? '' : formatCompact(val)}
                                                style={{ fontSize: '12px', fill: '#6b7280', fontWeight: 500, ...LABEL_HALO }}
                                            />
                                        )}
                                        {part === 'ahead' && (
                                            <LabelList
                                                dataKey="projected"
                                                content={(props: LabelProps) => {
                                                    const value = Number(props.value);
                                                    if (!value || isPrivacyMode || !budgetReady) return null;
                                                    return (
                                                        <text
                                                            x={Number(props.x) + Number(props.width) / 2}
                                                            y={Number(props.y) - 6}
                                                            textAnchor="middle"
                                                            fontSize={12}
                                                            fontWeight={600}
                                                            fill={INK[colourOf(value)]}
                                                            style={LABEL_HALO}
                                                        >
                                                            ≈{formatCompact(value)}
                                                        </text>
                                                    );
                                                }}
                                            />
                                        )}
                                        {monthlySpending.map(entry => {
                                            const color = entry.key === currentMonthKey ? GRAY : colourOf(entry.total);
                                            // Everything but the focused month fades back.
                                            const dimmed = selectedKey !== null && entry.key !== selectedKey;
                                            if (part === 'ahead') {
                                                // An outline of where the month is heading, in the colour it would end in.
                                                const heading = entry.projected !== undefined ? INK[colourOf(entry.projected)] : undefined;
                                                return (
                                                    <Cell
                                                        key={entry.key}
                                                        fill={heading ?? 'none'}
                                                        fillOpacity={0.06}
                                                        stroke={heading ?? 'none'}
                                                        strokeOpacity={dimmed ? 0.3 : 1}
                                                        strokeWidth={1.5}
                                                        strokeDasharray="4 3"
                                                    />
                                                );
                                            }
                                            return (
                                                <Cell
                                                    key={entry.key}
                                                    fill={part === 'everyday' ? color : stripes(color)}
                                                    fillOpacity={dimmed ? 0.3 : 1}
                                                />
                                            );
                                        })}
                                    </Bar>
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {openCategory && (
                <TransactionListModal
                    isOpen
                    onClose={() => setOpenCategory(null)}
                    title={openCategory}
                    subtitle={`${periodTitle} · ${openCategoryRows.length} payment${openCategoryRows.length === 1 ? '' : 's'}`}
                    transactions={openCategoryRows}
                />
            )}
        </div>
    );
});
