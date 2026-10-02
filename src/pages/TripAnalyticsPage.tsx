import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, CalendarDays, House, Layers, Lightbulb, Loader2, MapPin, Plane, Plus, RefreshCw, X } from 'lucide-react';
import type { Transaction, Trip } from '../types';
import { usePrivacy } from '../contexts/PrivacyContext';
import { useUserSettings } from '../contexts/UserSettingsContext';
import { useTrips } from '../hooks/useTrips';
import { clearTripsSaveError, createTrip, deleteTrip, loadTrips } from '../lib/tripsStore';
import { localDayKey, resolveTrip, tripStatus } from '../lib/tripUtils';
import { tripMetrics, tripYears, type TripMetrics } from '../lib/tripStats';
import { autoTripIcon, tripIcon } from '../lib/tripIcons';
import { detectUntrackedTrips, type DetectedTrip } from '../lib/tripDetection';
import { formatRub, formatRubSigned, formatTripRange, pluralDays } from '../lib/tripFormat';
import { cn } from '../lib/utils';
import { TripRow, TRIP_GRID } from '../components/TripRow';
import { TripDetail } from '../components/TripDetail';
import { TripFormModal, type TripFormValues } from '../components/TripFormModal';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface TripAnalyticsPageProps {
    transactions: Transaction[];
}

type SortKey = 'date' | 'name' | 'days' | 'total' | 'perDay' | 'extra';
type SortDir = 'asc' | 'desc';

// Per-device view preference, like the wallets' "Group by currency".
const GROUPED_KEY = 'tripsGroupedByYear';
const readGrouped = () => { try { return localStorage.getItem(GROUPED_KEY) !== 'false'; } catch { return true; } };
const storeGrouped = (v: boolean) => { try { localStorage.setItem(GROUPED_KEY, String(v)); } catch { /* storage blocked */ } };

// Each trip has its own address (/trip-analytics/<id>), so the back button, a reload and a
// bookmark all land on the trip rather than on the list.
export function TripAnalyticsPage({ transactions }: TripAnalyticsPageProps) {
    const { tripId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { trips, loading, loadError, saveError } = useTrips();

    useEffect(() => { window.scrollTo(0, 0); }, [tripId]);

    const errors = (
        <>
            {loadError && (
                <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700" role="alert">
                    <span>{loadError}</span>
                    <button onClick={() => loadTrips(true)} className="inline-flex items-center gap-1.5 font-semibold hover:text-red-900 whitespace-nowrap">
                        <RefreshCw className="w-4 h-4" /> Try again
                    </button>
                </div>
            )}
            {saveError && (
                <div className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700" role="alert">
                    <span>{saveError}</span>
                    <button onClick={clearTripsSaveError} className="p-0.5 hover:text-red-900" aria-label="Dismiss"><X className="w-4 h-4" /></button>
                </div>
            )}
        </>
    );

    if (!tripId) {
        return (
            <div className="space-y-6">
                {errors}
                <TripList
                    trips={trips}
                    loading={loading}
                    transactions={transactions}
                    onOpen={trip => navigate(`/trip-analytics/${trip.id}`, { state: { fromList: true } })}
                />
            </div>
        );
    }

    // Opened from the list: back is a real step back. Opened directly: back goes to the list.
    const backToList = () => (location.state?.fromList ? navigate(-1) : navigate('/trip-analytics', { replace: true }));
    const trip = trips.find(t => t.id === tripId);

    return (
        <div className="space-y-6">
            {errors}
            {trip ? (
                <TripDetail
                    key={trip.id}
                    trip={trip}
                    trips={trips}
                    transactions={transactions}
                    onBack={backToList}
                    onDeleted={() => navigate('/trip-analytics', { replace: true })}
                />
            ) : loading ? (
                <div className="flex items-center justify-center gap-2 py-24 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /> Loading the trip…</div>
            ) : (
                <div className="py-24 flex flex-col items-center gap-4 text-gray-500">
                    <p>This trip doesn't exist any more.</p>
                    <button onClick={() => navigate('/trip-analytics', { replace: true })} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-50 text-emerald-700 font-medium hover:bg-emerald-100">
                        <ArrowLeft className="w-4 h-4" /> All trips
                    </button>
                </div>
            )}
        </div>
    );
}

function TripList({ trips, loading, transactions, onOpen }: {
    trips: Trip[];
    loading: boolean;
    transactions: Transaction[];
    onOpen: (trip: Trip) => void;
}) {
    const { isPrivacyMode } = usePrivacy();
    const { settings, loading: settingsLoading, updatePreferences } = useUserSettings();
    // The new-trip form: empty from "Add trip", filled in from a detected trip.
    const [createDraft, setCreateDraft] = useState<TripFormValues | null>(null);
    const [tripToDelete, setTripToDelete] = useState<Trip | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [grouped, setGroupedState] = useState<boolean>(readGrouped);
    const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'date', dir: 'desc' });
    const setGrouped = (v: boolean) => { setGroupedState(v); storeGrouped(v); };

    const money = (n: number) => (isPrivacyMode ? '••••••' : formatRub(n));

    const metricsById = useMemo(() => {
        const map = new Map<string, TripMetrics>();
        for (const trip of trips) map.set(trip.id, tripMetrics(trip, trips, transactions));
        return map;
    }, [trips, transactions]);

    const years = useMemo(() => tripYears(trips, transactions), [trips, transactions]);
    const icons = useMemo(() => new Map(trips.map(t => [t.id, tripIcon(t, transactions)])), [trips, transactions]);

    const hiddenDetections = settings.preferences.hiddenTripSuggestions;
    const detected = useMemo(
        () => (loading ? [] : detectUntrackedTrips(trips, transactions, hiddenDetections ?? [])),
        [loading, trips, transactions, hiddenDetections]
    );
    // Dismissals live in the preferences blob, which must not be written before it has loaded.
    const dismissDetected = (d: DetectedTrip) => {
        if (settingsLoading) return;
        updatePreferences({ hiddenTripSuggestions: [...(hiddenDetections ?? []), d.key] });
    };

    // The tiles speak about this year, or the latest year with trips when this one has none.
    const summary = useMemo(() => {
        const thisYear = String(new Date().getFullYear());
        const focus = years.find(y => y.year === thisYear) ?? years[0];
        if (!focus) return null;
        const inYear = trips.filter(t => t.startDate.startsWith(focus.year));
        let onTrip = 0, covered = 0, extra = 0, compared = 0;
        for (const t of inYear) {
            const m = metricsById.get(t.id)!;
            onTrip += m.onTrip;
            covered += m.daysCovered;
            if (m.extraVsHome !== null) { extra += m.extraVsHome; compared++; }
        }
        // A payment two trips share counts once in the all-time figure too.
        const amounts = new Map<string, number>();
        for (const trip of trips) for (const t of resolveTrip(trip, transactions).counted) amounts.set(t.id, Math.abs(t.amount));
        const allTime = [...amounts.values()].reduce((s, a) => s + a, 0);
        return { year: focus, perDayThere: covered > 0 ? onTrip / covered : null, extra: compared > 0 ? extra : null, tripsInYear: inYear.length, allTime };
    }, [years, trips, transactions, metricsById]);

    const groups = useMemo(() => {
        const dir = sort.dir === 'asc' ? 1 : -1;
        const num = (t: Trip): number => {
            const m = metricsById.get(t.id)!;
            switch (sort.key) {
                case 'days': return m.days;
                case 'total': return m.total;
                case 'perDay': return m.onTripPerDay ?? -Infinity;
                case 'extra': return m.extraVsHome ?? -Infinity;
                default: return 0;
            }
        };
        const compare = (a: Trip, b: Trip) => {
            if (sort.key === 'date') return a.startDate.localeCompare(b.startDate) * dir || a.name.localeCompare(b.name);
            if (sort.key === 'name') return a.name.localeCompare(b.name) * dir;
            return (num(a) - num(b)) * dir || b.startDate.localeCompare(a.startDate);
        };
        const sorted = [...trips].sort(compare);
        if (!grouped) return [{ year: null, rows: sorted }];
        return years.map(y => ({ year: y, rows: sorted.filter(t => t.startDate.startsWith(y.year)) }));
    }, [trips, metricsById, years, grouped, sort]);

    const toggleSort = (key: SortKey) => setSort(prev => ({
        key,
        dir: prev.key === key ? (prev.dir === 'desc' ? 'asc' : 'desc') : key === 'name' ? 'asc' : 'desc',
    }));

    const sortIcon = (column: SortKey) => {
        if (sort.key !== column) return <ArrowUpDown className="w-3 h-3 text-gray-300" />;
        return sort.dir === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-600" /> : <ArrowDown className="w-3 h-3 text-emerald-600" />;
    };
    const headerCell = (label: string, column?: SortKey, className?: string) => column ? (
        <button
            type="button"
            onClick={() => toggleSort(column)}
            className={cn("flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-800 transition-colors select-none", className)}
        >
            {label}
            {sortIcon(column)}
        </button>
    ) : (
        <div className={cn("text-[11px] font-semibold uppercase tracking-wider text-gray-500", className)}>{label}</div>
    );

    const create = async (values: TripFormValues) => {
        const trip = await createTrip(values);
        setCreateDraft(null);
        onOpen(trip);
    };

    const confirmDelete = async () => {
        if (!tripToDelete) return;
        setIsDeleting(true);
        try {
            await deleteTrip(tripToDelete.id);
        } catch (e) {
            setDeleteError(`Couldn't delete "${tripToDelete.name.trim()}": ${e instanceof Error ? e.message : String(e)}`);
        }
        setIsDeleting(false);
        setTripToDelete(null);
    };

    const today = localDayKey();
    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Trips</h2>
                    <p className="text-gray-500">What each trip cost, bookings made ahead included, and how it compares with a day at home.</p>
                </div>
                <button
                    onClick={() => setCreateDraft({ name: '', startDate: '', endDate: '', icon: null, budget: null })}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-colors whitespace-nowrap"
                >
                    <Plus className="w-4 h-4" />
                    Add trip
                </button>
            </div>

            {deleteError && (
                <div className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700" role="alert">
                    <span>{deleteError}</span>
                    <button onClick={() => setDeleteError(null)} className="p-0.5 hover:text-red-900" aria-label="Dismiss"><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Detected trips */}
            {detected.length > 0 && (
                <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 sm:p-5">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-amber-500" />
                        Trips you haven't added
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5 mb-2">
                        Days with spending in another country's money that no trip covers. Create one in a click — the dates can be fixed in the form; × hides one for good.
                    </p>
                    <div className="divide-y divide-amber-100">
                        {detected.map(d => (
                            <div key={d.key} className="flex items-center gap-3 py-2">
                                <div className="w-9 h-9 rounded-lg bg-white border border-amber-100 flex items-center justify-center text-xl leading-none flex-shrink-0" aria-hidden>{d.flag}</div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-gray-900 truncate">{d.name}?</div>
                                    <div className="text-xs text-gray-500 truncate tabular-nums">
                                        {formatTripRange(d.startDate, d.endDate)} · {pluralDays(d.days)} · {money(d.spent)} paid in {d.currency}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setCreateDraft({ name: d.name, startDate: d.startDate, endDate: d.endDate, icon: null, budget: null })}
                                    className="inline-flex items-center gap-1 p-2 sm:px-2.5 sm:py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors flex-shrink-0"
                                    aria-label={`Create a trip to ${d.name}`}
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Create</span>
                                </button>
                                {!settingsLoading && (
                                    <button
                                        onClick={() => dismissDetected(d)}
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white transition-colors flex-shrink-0"
                                        title="Not a trip"
                                        aria-label={`Not a trip: ${d.name}`}
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Summary */}
            {summary && (
                <div className="grid grid-cols-3 gap-2 md:gap-4">
                    <SummaryTile
                        title={`Trips in ${summary.year.year}`}
                        value={money(summary.year.total)}
                        sub={`${summary.tripsInYear} trip${summary.tripsInYear === 1 ? '' : 's'} · ${pluralDays(summary.year.daysAway)} away · all time ${money(summary.allTime)}`}
                        icon={<CalendarDays className="w-9 h-9 text-emerald-500" strokeWidth={1.5} />}
                    />
                    <SummaryTile
                        title="A day there"
                        value={summary.perDayThere !== null ? money(summary.perDayThere) : '—'}
                        sub={`average day on the road in ${summary.year.year}, without what was booked ahead`}
                        icon={<MapPin className="w-9 h-9 text-purple-500" strokeWidth={1.5} />}
                    />
                    <SummaryTile
                        title="vs. staying home"
                        value={summary.extra !== null ? (isPrivacyMode ? '••••••' : formatRubSigned(summary.extra)) : '—'}
                        sub={summary.extra !== null
                            ? `what ${summary.year.year}'s trips cost beyond the same days of everyday life at home`
                            : 'not enough history before these trips to compare'}
                        icon={<House className="w-9 h-9 text-orange-400" strokeWidth={1.5} />}
                    />
                </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 px-4 md:px-6 py-2.5 border-b border-gray-100 bg-gray-50/60">
                    <button
                        onClick={() => setGrouped(!grouped)}
                        aria-pressed={grouped}
                        className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap",
                            grouped ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                        )}
                        title={grouped ? 'Show one list' : 'Group trips by year'}
                    >
                        <Layers className="w-3.5 h-3.5" />
                        Group by year
                    </button>
                    <span className="text-xs text-gray-400">{trips.length} trip{trips.length === 1 ? '' : 's'}</span>
                    <div className="md:hidden flex items-center gap-1.5 ml-auto">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Sort</span>
                        {([['date', 'Date'], ['total', 'Total'], ['perDay', 'Per day']] as [SortKey, string][]).map(([key, label]) => (
                            <button
                                key={key}
                                onClick={() => toggleSort(key)}
                                className={cn("px-2 py-1 rounded-full text-xs font-medium border whitespace-nowrap", sort.key === key ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-gray-200 text-gray-600")}
                            >
                                {label}{sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                            </button>
                        ))}
                    </div>
                </div>
                <div className={cn("hidden md:grid items-center gap-x-3 px-6 py-2.5 border-b border-gray-100", TRIP_GRID)}>
                    <div />
                    {headerCell('Trip', 'name')}
                    {headerCell('Days', 'days')}
                    {headerCell('Total', 'total', 'justify-end')}
                    {headerCell('Booked ahead', undefined, 'text-right')}
                    {headerCell('A day there', 'perDay', 'justify-end')}
                    {headerCell('vs. home', 'extra', 'justify-end')}
                    <div />
                </div>

                {loading && (
                    <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading trips…</div>
                )}

                {!loading && groups.map(group => (
                    <div key={group.year?.year ?? 'all'}>
                        {group.year && (
                            <div className="flex items-baseline justify-between gap-3 px-4 md:px-6 py-2.5 bg-gray-50 border-y border-gray-100">
                                <div className="flex items-baseline gap-2 text-sm font-semibold text-gray-800 min-w-0">
                                    <span>{group.year.year}</span>
                                    <span className="text-xs font-medium text-gray-400 truncate">
                                        {group.year.trips} trip{group.year.trips === 1 ? '' : 's'} · {pluralDays(group.year.daysAway)} away
                                    </span>
                                </div>
                                <div className="text-sm font-semibold text-gray-700 tabular-nums shrink-0">{money(group.year.total)}</div>
                            </div>
                        )}
                        {group.rows.map(trip => (
                            <TripRow
                                key={trip.id}
                                trip={trip}
                                icon={icons.get(trip.id) ?? null}
                                metrics={metricsById.get(trip.id)!}
                                status={tripStatus(trip, today)}
                                isPrivacyMode={isPrivacyMode}
                                onOpen={onOpen}
                                onDelete={setTripToDelete}
                            />
                        ))}
                    </div>
                ))}

                {!loading && trips.length === 0 && (
                    <div className="py-12 flex flex-col items-center justify-center text-gray-400 text-center px-6">
                        <Plane className="w-12 h-12 mb-4 opacity-50" />
                        <p className="text-lg font-medium text-gray-500">No trips yet</p>
                        <p className="text-sm">Add one with its dates — the spending in them is picked up by itself.</p>
                    </div>
                )}
            </div>

            {createDraft && <TripFormModal
                title="New trip"
                submitLabel="Create trip"
                initial={createDraft}
                autoIcon={v => autoTripIcon({ id: 'new', ...v, excludedTransactionIds: [], additionalTransactionIds: [] }, transactions)}
                onSubmit={create}
                onClose={() => setCreateDraft(null)}
            />}

            <ConfirmDialog
                isOpen={!!tripToDelete}
                title={tripToDelete ? `Delete "${tripToDelete.name.trim()}"?` : ''}
                description="The trip and its lists of added and switched-off transactions are removed. The transactions themselves stay in your data."
                confirmLabel="Delete trip"
                tone="danger"
                isBusy={isDeleting}
                onConfirm={confirmDelete}
                onCancel={() => setTripToDelete(null)}
            />

        </div>
    );
}

// Three across even on a phone: there the numbers stay and the explanations go.
function SummaryTile({ title, value, sub, icon }: { title: string; value: string; sub?: string; icon: ReactNode }) {
    return (
        <div className="bg-white p-3 md:p-5 rounded-xl shadow-sm border border-gray-100 flex items-start justify-between min-w-0">
            <div className="flex-1 min-w-0">
                <p className="text-[11px] md:text-sm font-medium text-gray-500 mb-1 leading-tight md:truncate">{title}</p>
                <div className="text-sm sm:text-lg md:text-2xl font-bold tabular-nums truncate text-gray-900">{value}</div>
                {sub && <p className="hidden md:block text-xs text-gray-400 mt-1.5 leading-snug">{sub}</p>}
            </div>
            <div className="hidden md:block flex-shrink-0 ml-3">{icon}</div>
        </div>
    );
}
