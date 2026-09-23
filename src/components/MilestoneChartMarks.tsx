import type { Milestone } from '../types';
import { KIND_ICONS, formatDayKey, type MilestoneMark } from '../lib/milestones';

// Milestones on the Trends charts: a dashed line through the month (a Recharts ReferenceLine
// the chart draws itself), this flag on top of it, and the titles in the month's tooltip.

export const MILESTONE_LINE_COLOR = '#9CA3AF';

/** The flag on a milestone line: the kind's icon, "+1" when a month holds more than one. */
export function MilestoneFlag({ viewBox, mark, onOpen }: {
    viewBox?: { x: number; y: number };   // filled in by Recharts: the top of the line
    mark: MilestoneMark;
    onOpen?: (milestone: Milestone) => void;
}) {
    if (!viewBox) return null;
    const first = mark.milestones[0];
    const Icon = KIND_ICONS[first.kind];
    return (
        <g
            transform={`translate(${viewBox.x}, ${viewBox.y})`}
            onClick={onOpen ? () => onOpen(first) : undefined}
            style={{ cursor: onOpen ? 'pointer' : undefined, pointerEvents: 'all' }}
        >
            <title>
                {mark.milestones.map(m => `${m.title} · ${formatDayKey(m.date)}`).join('\n')}
                {onOpen ? '\nOpen in Milestones' : ''}
            </title>
            <circle r={9} fill="#FFFFFF" stroke={MILESTONE_LINE_COLOR} />
            <Icon x={-6} y={-6} width={12} height={12} color="#4B5563" strokeWidth={2.25} />
            {mark.milestones.length > 1 && (
                <text x={12} y={-4} fontSize={10} fontWeight={600} fill="#6B7280">+{mark.milestones.length - 1}</text>
            )}
        </g>
    );
}

/** The month's milestones, under its values in a chart tooltip. */
export function MilestoneTooltipLines({ milestones }: { milestones: Milestone[] }) {
    return (
        <div className="flex flex-col gap-1">
            {milestones.map(m => {
                const Icon = KIND_ICONS[m.kind];
                return (
                    <div key={m.id} className="flex items-center gap-1.5 text-xs text-gray-600">
                        <Icon className="w-3 h-3 flex-shrink-0 text-gray-400" />
                        <span className="truncate max-w-[180px] font-medium">{m.title}</span>
                        <span className="text-gray-400 whitespace-nowrap">{formatDayKey(m.date).replace(/ \d{4}$/, '')}</span>
                    </div>
                );
            })}
        </div>
    );
}
