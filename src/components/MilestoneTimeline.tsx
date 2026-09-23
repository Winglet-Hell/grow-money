import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Milestone, MilestoneKind } from '../types';
import { cn } from '../lib/utils';
import { niceScale } from '../lib/chartScale';
import {
    KIND_ICONS, SIDE_COLORS, addDays, addMonths, daysInRange, formatDayKey, monthOffset,
    type MonthPoint, type RangeStats,
} from '../lib/milestones';

// A month-by-month chart of the whole statement with a flag on every milestone. Flags sit at
// their exact day, so a milestone on the 10th lands a third into its month. The two sides
// being compared are shaded; once the months stop fitting, the plot scrolls (opening on the
// latest ones) under a value axis that stays put.

const Y_AXIS_W = 52;
const MIN_MONTH_PX = 18;
const PAD_L = 4;
const PAD_R = 8;
const PLOT_H = 190;
const AXIS_H = 28;
const MIN_LABEL_PX = 36;   // closer month labels than this start to collide
const LANE_H = 30;         // flags that would overlap stack into up to three rows
const MAX_LANES = 3;
const FLAG_H = 24;
const FLAG_ANCHOR = 14;    // from a flag's edge to the middle of its icon, where the pole is
const FLAG_BASE_W = 38;    // border, padding, icon and gap around the title
const FLAG_MAX_CHARS = 26;
const GLYPH_PX = 6.8;      // rough width of a 12px Inter character, to lay flags out before they render
const FLAG_GAP = 6;
const TIP_W = 176;

const COLORS = {
    bar: '#d1d5db',
    income: '#10b981',
    grid: '#EEF0F3',
    hover: '#f3f4f6',
    pole: '#9ca3af',
    poleFaint: '#d1d5db',
    poleActive: '#111827',
};

const rub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const monthShort = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const monthLong = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const utcDate = (key: string) => new Date(`${key.length === 7 ? `${key}-01` : key}T00:00:00Z`);

interface MilestoneTimelineProps {
    series: MonthPoint[];                             // at least one month
    milestones: Milestone[];                          // all of them, sorted by date
    cutKind: MilestoneKind | 'all';                   // which ones open chapters right now
    ranges: { a: RangeStats; b: RangeStats } | null;  // the two sides being compared
    activeCut: string | null;                         // the milestone day compared around, if any
    onMilestoneClick: (milestone: Milestone) => void;
    isPrivacyMode: boolean;
}

export function MilestoneTimeline({ series, milestones, cutKind, ranges, activeCut, onMilestoneClick, isPrivacyMode }: MilestoneTimelineProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    const [hover, setHover] = useState<number | null>(null);
    const lastPointer = useRef('mouse');

    useLayoutEffect(() => {
        const scroller = scrollRef.current;
        if (!scroller) return;
        const measure = () => setWidth(scroller.clientWidth);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(scroller);
        return () => observer.disconnect();
    }, []);

    const months = series.length;
    const contentW = Math.max(width, months * MIN_MONTH_PX + PAD_L + PAD_R);
    const scrolls = width > 0 && contentW > width + 1;

    useEffect(() => {
        const scroller = scrollRef.current;
        if (scroller && scrolls) scroller.scrollLeft = scroller.scrollWidth;
    }, [scrolls, months]);

    // ------------------------------------------------------------------ x

    const firstMonth = series[0].key;
    const rangeStart = `${firstMonth}-01`;
    const rangeEnd = addDays(addMonths(`${series[months - 1].key}-01`, 1), -1);
    const monthW = (contentW - PAD_L - PAD_R) / months;
    const xOf = (offset: number) => PAD_L + offset * monthW;
    const xOfDay = (day: string) => xOf(monthOffset(day, firstMonth));

    // Flags go left to right into the lowest row where they don't touch the one before.
    const laneEnds: number[] = [];
    const flags = milestones
        .filter(m => m.date >= rangeStart && m.date <= rangeEnd)
        .map(m => {
            const x = xOfDay(m.date);
            const w = FLAG_BASE_W + Math.min(m.title.length, FLAG_MAX_CHARS) * GLYPH_PX;
            const flipped = x - FLAG_ANCHOR + w > contentW; // no room on the right: the title runs left of its pole
            const left = Math.max(0, flipped ? x + FLAG_ANCHOR - w : x - FLAG_ANCHOR);
            let lane = laneEnds.findIndex(end => end + FLAG_GAP <= left);
            if (lane === -1) {
                lane = laneEnds.length < MAX_LANES ? laneEnds.push(0) - 1 : laneEnds.indexOf(Math.min(...laneEnds));
            }
            laneEnds[lane] = left + w;
            return { m, x, lane, flipped };
        });
    const lanes = laneEnds.length;
    const flagTop = (lane: number) => (lanes - 1 - lane) * LANE_H;

    // ------------------------------------------------------------------ y

    const plotTop = lanes * LANE_H + 12;
    const plotBottom = plotTop + PLOT_H;
    const height = plotBottom + AXIS_H;
    const scale = niceScale(0, Math.max(1, ...series.map(p => Math.max(p.expenses, p.income))));
    const [d0, d1] = scale.domain;
    const yOf = (value: number) => plotBottom - ((value - d0) / (d1 - d0 || 1)) * PLOT_H;
    const axisLabel = (value: number) => {
        if (isPrivacyMode) return '•••';
        if (value === 0) return '0';
        return value >= 1_000_000 ? `₽${+(value / 1_000_000).toFixed(1)}M` : `₽${Math.round(value / 1000)}k`;
    };

    // ------------------------------------------------------------------ marks

    const barW = Math.min(22, Math.max(4, monthW * 0.6));

    // A month takes a side's colour when that side covers at least half of it.
    const overlap = (p: MonthPoint, r: RangeStats) => {
        const from = p.from > r.from ? p.from : r.from;
        const to = p.to < r.to ? p.to : r.to;
        return from <= to ? daysInRange(from, to) : 0;
    };
    const sideOf = (p: MonthPoint): 'a' | 'b' | null => {
        if (!ranges) return null;
        const covered = daysInRange(p.from, p.to);
        const a = overlap(p, ranges.a);
        const b = overlap(p, ranges.b);
        if (a * 2 >= covered && a >= b) return 'a';
        if (b * 2 >= covered) return 'b';
        return null;
    };

    const incomePoints = series
        .map((p, i) => (p.partial ? null : `${xOf(i + 0.5)},${yOf(p.income)}`))
        .filter(Boolean)
        .join(' ');

    // Month names while they fit (every other one when tight, keeping January as its year),
    // years alone for longer histories.
    const axisLabels: { x: number; text: string; anchor: 'middle' | 'start'; tick: boolean }[] = [];
    if (months <= 24) {
        const step = Math.max(1, Math.ceil(MIN_LABEL_PX / monthW));
        const janIndex = series.findIndex(p => p.key.endsWith('-01'));
        const offset = janIndex >= 0 ? janIndex % step : 0;
        series.forEach((p, i) => {
            if ((i - offset) % step !== 0) return;
            const isJan = p.key.endsWith('-01');
            const first = axisLabels.length === 0 && !isJan;
            const name = monthShort.format(utcDate(p.key));
            axisLabels.push({ x: xOf(i + 0.5), text: isJan ? p.key.slice(0, 4) : first ? `${name} ${p.key.slice(0, 4)}` : name, anchor: 'middle', tick: false });
        });
    } else {
        series.forEach((p, i) => {
            if (p.key.endsWith('-01')) axisLabels.push({ x: xOf(i) + 4, text: p.key.slice(0, 4), anchor: 'start', tick: true });
        });
    }

    const hovered = hover !== null ? series[hover] : null;

    return (
        <div>
            <div className="flex w-full min-w-0">
                <div className="relative flex-shrink-0" style={{ width: Y_AXIS_W, height }} aria-hidden="true">
                    {scale.ticks.map(tick => (
                        <span
                            key={tick}
                            className="absolute right-2 -translate-y-1/2 text-xs text-gray-500 tabular-nums whitespace-nowrap"
                            style={{ top: yOf(tick) }}
                        >
                            {axisLabel(tick)}
                        </span>
                    ))}
                </div>

                <div ref={scrollRef} className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain">
                    <div className="relative" style={{ width: width > 0 ? contentW : '100%', height }}>
                        <svg width={contentW} height={height} className="block" role="img" aria-label="Spending and income by month, with your milestones">
                            {ranges && (['a', 'b'] as const).map(side => {
                                const r = ranges[side];
                                const x = xOfDay(r.from);
                                const w = xOfDay(addDays(r.to, 1)) - x;
                                return (
                                    <g key={side}>
                                        <rect x={x} y={plotTop} width={w} height={PLOT_H} fill={SIDE_COLORS[side].band} opacity={0.7} />
                                        {w >= 16 && (
                                            <text x={x + 5} y={plotTop + 14} fill={SIDE_COLORS[side].text} fontSize={11} fontWeight={600}>
                                                {side.toUpperCase()}
                                            </text>
                                        )}
                                    </g>
                                );
                            })}

                            {scale.ticks.map(tick => (
                                <line key={tick} x1={0} x2={contentW} y1={yOf(tick)} y2={yOf(tick)} stroke={COLORS.grid} />
                            ))}

                            {hover !== null && (
                                <rect x={xOf(hover)} y={plotTop} width={monthW} height={PLOT_H} fill={COLORS.hover} opacity={0.8} />
                            )}

                            {series.map((p, i) => {
                                const side = sideOf(p);
                                const y = yOf(p.expenses);
                                return (
                                    <rect
                                        key={p.key}
                                        x={xOf(i + 0.5) - barW / 2}
                                        y={y}
                                        width={barW}
                                        height={Math.max(0, plotBottom - y)}
                                        rx={Math.min(3, barW / 3)}
                                        fill={side ? SIDE_COLORS[side].bar : COLORS.bar}
                                        opacity={p.partial ? 0.45 : 1}
                                    />
                                );
                            })}

                            {incomePoints.includes(' ') && (
                                <polyline points={incomePoints} fill="none" stroke={COLORS.income} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                            )}

                            {flags.map(({ m, x, lane }) => {
                                const cutting = cutKind === 'all' || m.kind === cutKind;
                                const active = cutting && m.date === activeCut;
                                return (
                                    <line
                                        key={m.id}
                                        x1={x} x2={x}
                                        y1={flagTop(lane) + FLAG_H} y2={plotBottom}
                                        stroke={active ? COLORS.poleActive : cutting ? COLORS.pole : COLORS.poleFaint}
                                        strokeWidth={active ? 1.5 : 1}
                                        strokeDasharray={active ? undefined : cutting ? '4 3' : '2 3'}
                                    />
                                );
                            })}

                            <line x1={0} x2={contentW} y1={plotBottom} y2={plotBottom} stroke="#E5E7EB" />
                            {axisLabels.map(label => {
                                // A centred label near either edge ("Mar 2026" under the first month) is kept inside.
                                const half = (label.text.length * GLYPH_PX) / 2;
                                const x = label.anchor === 'middle' ? Math.min(Math.max(label.x, half + 2), contentW - half - 2) : label.x;
                                return (
                                    <g key={`${label.x}-${label.text}`}>
                                        {label.tick && <line x1={label.x - 4} x2={label.x - 4} y1={plotBottom} y2={plotBottom + 6} stroke="#D1D5DB" />}
                                        <text x={x} y={plotBottom + 18} textAnchor={label.anchor} fill="#6B7280" fontSize={12}>
                                            {label.text}
                                        </text>
                                    </g>
                                );
                            })}

                            {/* One target per month: a mouse shows it on hover, a finger toggles it with a tap.
                                A tap also fires hover events, which would open and close it at once, and a
                                swipe along the chart shouldn't open it — only a click that follows a tap does. */}
                            {series.map((p, i) => (
                                <rect
                                    key={`hit-${p.key}`}
                                    x={xOf(i)}
                                    y={plotTop}
                                    width={monthW}
                                    height={PLOT_H}
                                    fill="transparent"
                                    onPointerEnter={e => { if (e.pointerType === 'mouse') setHover(i); }}
                                    onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(h => (h === i ? null : h)); }}
                                    onPointerDown={e => { lastPointer.current = e.pointerType; }}
                                    onClick={() => { if (lastPointer.current !== 'mouse') setHover(h => (h === i ? null : i)); }}
                                />
                            ))}
                        </svg>

                        {flags.map(({ m, x, lane, flipped }) => {
                            const Icon = KIND_ICONS[m.kind];
                            const cutting = cutKind === 'all' || m.kind === cutKind;
                            const active = cutting && m.date === activeCut;
                            return (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => onMilestoneClick(m)}
                                    aria-pressed={active}
                                    title={`${m.title} · ${formatDayKey(m.date)}${m.note ? ` — ${m.note}` : ''}`}
                                    className={cn(
                                        "absolute flex items-center gap-1.5 h-6 rounded-md border text-xs font-medium whitespace-nowrap transition-colors",
                                        flipped ? "flex-row-reverse pl-2.5 pr-1.5" : "pl-1.5 pr-2.5",
                                        active
                                            ? "bg-gray-900 border-gray-900 text-white"
                                            : cutting
                                                ? "bg-white border-gray-200 text-gray-700 shadow-sm hover:border-gray-300 hover:bg-gray-50"
                                                : "bg-white border-dashed border-gray-200 text-gray-400 hover:text-gray-600"
                                    )}
                                    style={{
                                        top: flagTop(lane),
                                        maxWidth: FLAG_BASE_W + FLAG_MAX_CHARS * GLYPH_PX,
                                        ...(flipped
                                            ? { right: Math.max(0, contentW - x - FLAG_ANCHOR) }
                                            : { left: Math.max(0, x - FLAG_ANCHOR) }),
                                    }}
                                >
                                    <Icon className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate">{m.title}</span>
                                </button>
                            );
                        })}

                        {hovered && hover !== null && (
                            <div
                                className="absolute pointer-events-none bg-white/95 backdrop-blur-sm p-3 rounded-xl shadow-xl border border-gray-100 flex flex-col gap-1.5"
                                style={{
                                    width: TIP_W,
                                    top: plotTop + 8,
                                    left: xOf(hover + 1) + 6 + TIP_W <= contentW ? xOf(hover + 1) + 6 : Math.max(0, xOf(hover) - 6 - TIP_W),
                                }}
                            >
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-1.5">
                                    {monthLong.format(utcDate(hovered.key))}{hovered.partial ? ' · part' : ''}
                                </p>
                                <TipRow color={COLORS.bar} label="Spent" value={isPrivacyMode ? '••••••' : rub.format(hovered.expenses)} />
                                <TipRow color={COLORS.income} label="Earned" value={isPrivacyMode ? '••••••' : rub.format(hovered.income)} />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-500" style={{ paddingLeft: Y_AXIS_W }}>
                <LegendMark color={COLORS.bar} mark="rect" label="Spent per month" />
                <LegendMark color={COLORS.income} mark="line" label="Earned" />
                {ranges && (
                    <>
                        <LegendMark color={SIDE_COLORS.a.bar} mark="rect" label="A, earlier side" />
                        <LegendMark color={SIDE_COLORS.b.bar} mark="rect" label="B, later side" />
                    </>
                )}
            </div>
        </div>
    );
}

function TipRow({ color, label, value }: { color: string; label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-xs font-medium text-gray-500">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                {label}
            </span>
            <span className="text-xs font-bold text-gray-900 tabular-nums">{value}</span>
        </div>
    );
}

function LegendMark({ color, mark, label }: { color: string; mark: 'rect' | 'line'; label: string }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className={mark === 'rect' ? 'w-2.5 h-2.5 rounded-sm' : 'w-3.5 h-0.5 rounded-full'} style={{ backgroundColor: color }} />
            {label}
        </span>
    );
}
