import React from 'react';
import { Plane, Trash2 } from 'lucide-react';
import type { Trip } from '../types';
import type { TripMetrics } from '../lib/tripStats';
import type { TripStatus } from '../lib/tripUtils';
import { cn } from '../lib/utils';
import { formatRub, formatRubSigned, formatTripRange, pluralDays } from '../lib/tripFormat';

interface TripRowProps {
    trip: Trip;
    icon: string | null; // emoji, or null for the plane
    metrics: TripMetrics;
    status: TripStatus;
    isPrivacyMode: boolean;
    onOpen: (trip: Trip) => void;
    onDelete: (trip: Trip) => void;
}

// Shared column template: icon · trip · days · total · booked ahead · a day there · vs home · actions.
export const TRIP_GRID = 'md:grid-cols-[2rem_minmax(0,2.2fr)_minmax(0,0.55fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2.5rem]';

const STATUS_BADGE: Record<TripStatus, { label: string; className: string } | null> = {
    ongoing: { label: 'Now', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    upcoming: { label: 'Upcoming', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    past: null,
};

export const TripRow: React.FC<TripRowProps> = ({ trip, icon, metrics, status, isPrivacyMode, onOpen, onDelete }) => {
    const money = (n: number) => (isPrivacyMode ? '••••' : formatRub(n));
    const badge = STATUS_BADGE[status];
    const extra = metrics.extraVsHome;

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onOpen(trip)}
            onKeyDown={e => { if (e.key === 'Enter') onOpen(trip); }}
            className={cn(
                "grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 md:px-6 py-2.5 border-b border-gray-100 last:border-0 cursor-pointer transition-colors hover:bg-gray-50/70 focus:outline-none focus-visible:bg-emerald-50/50",
                TRIP_GRID
            )}
        >
            {/* Icon */}
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-50 text-emerald-600 text-lg leading-none" aria-hidden>
                {icon ?? <Plane className="w-4 h-4" />}
            </div>

            {/* Trip */}
            <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-gray-900 truncate" title={trip.name}>{trip.name}</span>
                    {badge && (
                        <span className={cn("shrink-0 px-1.5 py-px rounded-md border text-[10px] font-semibold uppercase tracking-wide", badge.className)}>{badge.label}</span>
                    )}
                </div>
                <div className="text-xs text-gray-400 truncate tabular-nums">
                    {formatTripRange(trip.startDate, trip.endDate)}
                    {/* On phones the second line carries the hidden days column. */}
                    <span className="md:hidden"> · {pluralDays(metrics.days)}</span>
                </div>
            </div>

            {/* Days */}
            <div className="hidden md:block text-sm text-gray-600 tabular-nums">{metrics.days}</div>

            {/* Total (+ a day there, on phones) */}
            <div className="text-right">
                <div className="font-semibold text-gray-900 tabular-nums whitespace-nowrap">{money(metrics.total)}</div>
                {trip.budget ? (
                    <div className={cn("hidden md:block text-xs tabular-nums whitespace-nowrap", metrics.total > trip.budget ? "text-red-500" : "text-gray-400")}>
                        of {money(trip.budget)}
                    </div>
                ) : null}
                <div className="text-xs text-gray-400 tabular-nums whitespace-nowrap md:hidden">
                    {metrics.onTripPerDay !== null ? `${money(metrics.onTripPerDay)}/day` : 'not started'}
                </div>
            </div>

            {/* Booked ahead */}
            <div
                className="hidden md:block text-right text-sm text-gray-600 tabular-nums"
                title={metrics.bookedAheadCount ? `${metrics.bookedAheadCount} payment${metrics.bookedAheadCount === 1 ? '' : 's'} made before the trip` : undefined}
            >
                {metrics.bookedAhead > 0 ? money(metrics.bookedAhead) : <span className="text-gray-300">—</span>}
            </div>

            {/* A day there */}
            <div className="hidden md:block text-right text-sm text-gray-600 tabular-nums">
                {metrics.onTripPerDay !== null ? money(metrics.onTripPerDay) : <span className="text-gray-300">—</span>}
            </div>

            {/* vs home */}
            <div
                className="hidden md:block text-right text-sm tabular-nums"
                title={extra !== null && metrics.home
                    ? `Cost ${isPrivacyMode ? '••••' : formatRubSigned(extra)} compared with the same ${pluralDays(metrics.daysCovered)} at home (everyday spending there ≈ ${money(metrics.home.perDay)}/day)`
                    : 'Not enough history before this trip to compare'}
            >
                {extra === null
                    ? <span className="text-gray-300">—</span>
                    : <span className={extra > 0 ? "text-amber-600" : "text-emerald-600"}>{isPrivacyMode ? '••••' : formatRubSigned(extra)}</span>}
            </div>

            {/* Actions */}
            <div className="hidden md:flex justify-end">
                <button
                    onClick={e => { e.stopPropagation(); onDelete(trip); }}
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                    title="Delete trip"
                    aria-label={`Delete ${trip.name}`}
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};
