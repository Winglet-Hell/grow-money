import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

const Y_AXIS_WIDTH = 52;

interface ScrollableChartProps {
    points: number;                 // categories on the x-axis (months)
    minPointWidth?: number;         // px per point; below this the plot scrolls instead of squeezing
    margin: { top: number; right: number; bottom: number; left: number }; // the chart's own margin
    xAxisHeight: number;            // the chart's own XAxis height, so both halves line up
    yDomain: [number, number];
    yTicks: number[];
    yTickFormatter: (value: number) => string;
    children: React.ReactNode;      // a ResponsiveContainer chart with <YAxis hide domain={yDomain} ticks={yTicks} />
}

/**
 * A time-series chart whose value axis stays put while the plot scrolls sideways. Bars need a
 * minimum width to stay readable, so once the months no longer fit, the plot keeps that width
 * and scrolls, opening on the latest months; until then it simply fills the card.
 *
 * The axis labels are plain HTML placed on the same scale the chart uses (pass the chart the
 * same domain and ticks), which keeps them level with its gridlines.
 */
export function ScrollableChart({
    points, minPointWidth = 20, margin, xAxisHeight, yDomain, yTicks, yTickFormatter, children,
}: ScrollableChartProps) {
    const frameRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });

    // The scroller's client box, not the frame's: a classic horizontal scrollbar takes height
    // from the chart, and the axis labels have to follow the chart.
    useLayoutEffect(() => {
        const frame = frameRef.current;
        const scroller = scrollRef.current;
        if (!frame || !scroller) return;
        const measure = () => setSize({ width: scroller.clientWidth, height: scroller.clientHeight });
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(frame);
        observer.observe(scroller);
        return () => observer.disconnect();
    }, []);

    const contentWidth = Math.max(size.width, points * minPointWidth + margin.left + margin.right);
    const scrolls = size.width > 0 && contentWidth > size.width + 1;

    // Open on the latest months, and again whenever the period changes.
    useEffect(() => {
        const scroller = scrollRef.current;
        if (scroller && scrolls) scroller.scrollLeft = scroller.scrollWidth;
    }, [scrolls, contentWidth, points]);

    const plotHeight = size.height - margin.top - margin.bottom - xAxisHeight;
    const [y0, y1] = yDomain;
    const yOf = (value: number) => margin.top + (1 - (value - y0) / (y1 - y0 || 1)) * plotHeight;

    return (
        <div ref={frameRef} className="flex h-full w-full min-w-0">
            <div className="relative h-full flex-shrink-0" style={{ width: Y_AXIS_WIDTH }} aria-hidden="true">
                {plotHeight > 0 && yTicks.map(tick => (
                    <span
                        key={tick}
                        className="absolute right-2 -translate-y-1/2 text-xs text-gray-500 tabular-nums whitespace-nowrap"
                        style={{ top: yOf(tick) }}
                    >
                        {yTickFormatter(tick)}
                    </span>
                ))}
            </div>
            <div ref={scrollRef} className="h-full flex-1 min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain">
                <div className="h-full" style={{ width: size.width > 0 ? contentWidth : '100%' }}>
                    {children}
                </div>
            </div>
        </div>
    );
}

interface LegendItem {
    label: string;
    color: string;
    mark: 'rect' | 'line';          // mirrors the mark: a swatch for bars, a stroke for lines
}

/** A legend kept outside the scrolling plot, so it stays in view. */
export function ChartLegend({ items }: { items: LegendItem[] }) {
    return (
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-500">
            {items.map(item => (
                <span key={item.label} className="inline-flex items-center gap-1.5">
                    <span
                        className={item.mark === 'rect' ? 'w-2.5 h-2.5 rounded-sm' : 'w-3.5 h-0.5 rounded-full'}
                        style={{ backgroundColor: item.color }}
                    />
                    {item.label}
                </span>
            ))}
        </div>
    );
}

interface PickedLabelProps {
    picked: Set<number>;                 // indices that get a number (see labelIndices)
    format: (value: number) => string;   // '' hides the label (privacy mode)
    placement?: 'above' | 'below';       // points only: which side of the point
    // Filled in by Recharts' <LabelList content={...} />
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    value?: number;
    index?: number;
}

/** LabelList content for bars: the value past the bar's end (under a negative bar), on picked bars only. */
export function PickedBarLabel({ picked, format, x = 0, y = 0, width = 0, height = 0, value, index }: PickedLabelProps) {
    if (index === undefined || value === undefined || !picked.has(index)) return null;
    const text = format(value);
    if (!text) return null;
    const top = Math.min(y, y + height);
    const bottom = Math.max(y, y + height);
    return (
        <text x={x + width / 2} y={value < 0 ? bottom + 12 : top - 6} textAnchor="middle" fill="#6B7280" fontSize={10}>
            {text}
        </text>
    );
}

/** LabelList content for line and area points: the value beside the point, on picked points only. */
export function PickedPointLabel({ picked, format, placement = 'above', x = 0, y = 0, value, index }: PickedLabelProps) {
    if (index === undefined || value === undefined || !picked.has(index)) return null;
    const text = format(value);
    if (!text) return null;
    return (
        <text x={x} y={placement === 'above' ? y - 10 : y + 18} textAnchor="middle" fill="#6B7280" fontSize={10}>
            {text}
        </text>
    );
}
