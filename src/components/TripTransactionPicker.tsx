import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus, Search, X } from 'lucide-react';
import type { Transaction, Trip } from '../types';
import { useUserSettings } from '../contexts/UserSettingsContext';
import { getCategoryIcon } from '../lib/categoryIcons';
import { cn, formatDate, getTransactionNote, getTransactionTitle, stringToColor } from '../lib/utils';
import { formatRub } from '../lib/tripFormat';
import { dateKeyOf } from '../lib/periods';
import { daysBetween, resolveTrip, type TripSuggestion } from '../lib/tripUtils';

interface TripTransactionPickerProps {
    trip: Trip;
    trips: Trip[];
    transactions: Transaction[];
    suggestions: TripSuggestion[];
    isPrivacyMode: boolean;
    onAdd: (tx: Transaction) => void;
    onClose: () => void;
}

const DEFAULT_CHIPS = ['Accommodation', 'Intercity', 'Travel'];
const AROUND_BEFORE = 30; // days before the trip shown with an empty search
const AROUND_AFTER = 7;

// How far a transaction lies from the trip's dates, in days (0 inside them).
const distanceFrom = (trip: Trip, tx: Transaction) => {
    const day = dateKeyOf(tx.date) ?? '';
    if (day < trip.startDate) return daysBetween(day, trip.startDate);
    if (day > trip.endDate) return daysBetween(trip.endDate, day);
    return 0;
};

const whenLabel = (trip: Trip, tx: Transaction) => {
    const day = dateKeyOf(tx.date) ?? '';
    const n = distanceFrom(trip, tx);
    if (n === 0) return 'during the trip';
    return `${n} day${n === 1 ? '' : 's'} ${day < trip.startDate ? 'before' : 'after'}`;
};

const matches = (t: Transaction, q: string) =>
    (t.category || '').toLowerCase().includes(q) ||
    (t.note || '').toLowerCase().includes(q) ||
    (t.account || '').toLowerCase().includes(q) ||
    (Array.isArray(t.tags) && t.tags.some(tag => tag && tag.toLowerCase().includes(q))) ||
    (typeof t.tags === 'string' && (t.tags as string).toLowerCase().includes(q)) ||
    (t.originalCurrency || '').toLowerCase().includes(q) ||
    String(Math.abs(Math.round(t.amount))).includes(q) ||
    (t.originalAmount !== undefined && String(Math.abs(t.originalAmount)).includes(q));

// Mounted only while open, so every opening starts from a clean search.
export const TripTransactionPicker: React.FC<TripTransactionPickerProps> = ({
    trip, trips, transactions, suggestions, isPrivacyMode, onAdd, onClose,
}) => {
    const { settings, loading: settingsLoading, updatePreferences } = useUserSettings();
    const [query, setQuery] = useState('');
    const [addedNow, setAddedNow] = useState<Set<string>>(new Set());
    // The suggestions as they were on opening, so one just added keeps its place (with a tick).
    const [shownSuggestions] = useState(suggestions);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    // What this trip already lists, and which other trip counts a transaction (for the badge).
    const listed = useMemo(() => new Set(resolveTrip(trip, transactions).entries.map(e => e.tx.id)), [trip, transactions]);
    const otherTrip = useMemo(() => {
        const map = new Map<string, string>();
        for (const other of trips) {
            if (other.id === trip.id) continue;
            for (const t of resolveTrip(other, transactions).counted) if (!map.has(t.id)) map.set(t.id, other.name.trim());
        }
        return map;
    }, [trip.id, trips, transactions]);

    const { suggested, others } = useMemo(() => {
        // A row added in this sitting stays in place with a tick instead of vanishing.
        const available = (t: Transaction) => t.type === 'expense' && (!listed.has(t.id) || addedNow.has(t.id));
        const q = query.trim().toLowerCase();
        // Nearest first; at the same distance a payment before the trip (a booking) beats one after it.
        const after = (t: Transaction) => ((dateKeyOf(t.date) ?? '') > trip.endDate ? 1 : 0);
        const byDistance = (a: Transaction, b: Transaction) =>
            distanceFrom(trip, a) - distanceFrom(trip, b) || after(a) - after(b) || b.date.localeCompare(a.date);
        if (q) {
            return {
                suggested: [] as Transaction[],
                others: transactions.filter(t => available(t) && matches(t, q)).sort(byDistance).slice(0, 50),
            };
        }
        const suggestedIds = new Set(shownSuggestions.map(s => s.tx.id));
        const around = transactions.filter(t => {
            if (!available(t) || suggestedIds.has(t.id)) return false;
            const day = dateKeyOf(t.date) ?? '';
            return day < trip.startDate ? distanceFrom(trip, t) <= AROUND_BEFORE : day > trip.endDate && distanceFrom(trip, t) <= AROUND_AFTER;
        });
        return {
            suggested: shownSuggestions.map(s => s.tx).filter(available),
            others: around.sort(byDistance).slice(0, 50),
        };
    }, [query, shownSuggestions, transactions, trip, listed, addedNow]);

    const chips = settings.preferences.customSearchTags || DEFAULT_CHIPS;
    const queryText = query.trim();
    // Chips live in the shared preferences blob; writing it before it has loaded would wipe it.
    const canEditChips = !settingsLoading;

    const add = (tx: Transaction) => {
        if (addedNow.has(tx.id)) return;
        onAdd(tx);
        setAddedNow(prev => new Set(prev).add(tx.id));
    };

    const renderRow = (t: Transaction) => {
        const Icon = getCategoryIcon(t.category);
        const color = stringToColor(t.category);
        const done = addedNow.has(t.id);
        const elsewhere = otherTrip.get(t.id);
        return (
            <button
                key={t.id}
                type="button"
                onClick={() => add(t)}
                disabled={done}
                className={cn(
                    "w-full text-left bg-white p-3 rounded-2xl border shadow-sm transition-all flex items-center gap-3",
                    done ? "border-emerald-200 bg-emerald-50/40" : "border-gray-100 hover:border-emerald-200 hover:shadow-md"
                )}
            >
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", color.bg, color.text)}>
                    <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-900 truncate">{getTransactionTitle(t)}</div>
                    {getTransactionNote(t) && <div className="text-xs text-gray-600 truncate" title={getTransactionNote(t)}>{getTransactionNote(t)}</div>}
                    <div className="text-xs text-gray-500 truncate">
                        <span className="font-medium text-gray-600">{t.category}</span> · {formatDate(t.date)} · {whenLabel(trip, t)}
                    </div>
                    {elsewhere && !done && (
                        <div className="text-[11px] text-amber-700 mt-0.5 truncate">Already in {elsewhere}</div>
                    )}
                </div>
                <div className="font-bold text-gray-900 whitespace-nowrap tabular-nums">{isPrivacyMode ? '••••' : formatRub(Math.abs(t.amount))}</div>
                <span className={cn("p-2 rounded-xl flex-shrink-0", done ? "bg-emerald-100 text-emerald-700" : "bg-emerald-50 text-emerald-600")} aria-hidden>
                    {done ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                </span>
            </button>
        );
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm fixed" onClick={onClose} />
                <div className="relative z-10 bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 flex-none">
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">Add to {trip.name.trim()}</h3>
                            {addedNow.size > 0 && <p className="text-xs text-emerald-700">{addedNow.size} added</p>}
                        </div>
                        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400" aria-label="Close">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-4 flex-none border-b border-gray-100 flex flex-col gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search by category, note, tag, amount…"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                className="w-full pl-9 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
                                autoFocus
                            />
                            {query && (
                                <button onClick={() => setQuery('')} className="absolute right-2 top-2 p-1 text-gray-400 hover:text-gray-600" aria-label="Clear search">
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 flex items-center gap-2 overflow-x-auto scrollbar-hide">
                                <button
                                    onClick={() => setQuery(trip.name.split('#')[0].trim())}
                                    className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-lg hover:bg-emerald-100 transition-colors whitespace-nowrap flex-shrink-0"
                                >
                                    {trip.name.split('#')[0].trim()}
                                </button>
                                {chips.map(tag => (
                                    <div key={tag} className="flex items-center bg-gray-100 rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
                                        <button
                                            onClick={() => setQuery(tag)}
                                            className="px-3 py-1.5 text-gray-600 text-xs font-medium hover:bg-gray-200 transition-colors whitespace-nowrap"
                                        >
                                            {tag}
                                        </button>
                                        {canEditChips && (
                                            <button
                                                onClick={() => updatePreferences({ customSearchTags: chips.filter(t => t !== tag) })}
                                                className="px-1.5 py-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                title="Remove this shortcut"
                                                aria-label={`Remove ${tag}`}
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {canEditChips && queryText && !chips.includes(queryText) && (
                                <button
                                    onClick={() => updatePreferences({ customSearchTags: [...chips, queryText] })}
                                    className="flex-none px-2 py-1 bg-gray-50 border border-gray-200 text-gray-600 rounded-lg hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-colors"
                                    title="Keep this search as a shortcut"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin bg-gray-50/30">
                        {suggested.length > 0 && (
                            <>
                                <p className="px-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700">Looks like part of this trip</p>
                                {suggested.map(renderRow)}
                            </>
                        )}
                        {others.length > 0 && (
                            <>
                                <p className="px-2 pt-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                    {queryText ? 'Closest to the trip first' : `Paid in the ${AROUND_BEFORE} days before or the week after`}
                                </p>
                                {others.map(renderRow)}
                            </>
                        )}
                        {suggested.length === 0 && others.length === 0 && (
                            <div className="text-center py-12 flex flex-col items-center text-gray-400">
                                <Search className="w-12 h-12 mb-3 opacity-20" />
                                <p>{queryText ? 'Nothing matches that search.' : 'Nothing paid around these dates. Search to find older payments.'}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
