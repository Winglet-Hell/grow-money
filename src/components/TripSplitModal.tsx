import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Plane, Plus, Scissors, X } from 'lucide-react';
import type { Transaction, Trip } from '../types';
import { cn, formatDate, getTransactionNote, getTransactionTitle } from '../lib/utils';
import { formatRub, formatTripRange } from '../lib/tripFormat';
import { dateKeyOf } from '../lib/periods';
import { daysBetween, resolveTrip, tripDayCount } from '../lib/tripUtils';

export interface SplitPart {
    trip: Trip;
    share: number; // 0–1 of the payment; 0 switches it off in that trip
}

interface TripSplitModalProps {
    tx: Transaction;
    trip: Trip; // the trip the split was opened from — always part of it
    trips: Trip[];
    transactions: Transaction[];
    iconFor: (trip: Trip) => string | null;
    onSave: (parts: SplitPart[]) => Promise<void>;
    onClose: () => void;
}

interface Row {
    trip: Trip;
    amount: string; // as typed, in rubles
}

const parseAmount = (text: string) => {
    const n = Number(text.replace(/[\s₽]/g, '').replace(',', '.')); // \s covers the no-break spaces of "1 000"
    return text.trim() === '' ? 0 : n;
};
const roundRub = (n: number) => String(Math.round(n));

// How far a trip lies from a day: 0 inside it, else the days to its nearer end.
const distance = (trip: Trip, day: string) =>
    day < trip.startDate ? daysBetween(day, trip.startDate) : day > trip.endDate ? daysBetween(trip.endDate, day) : 0;

// One payment for two trips — a flight out of one country bought with the hotel in the next —
// split by amount: each trip counts its part. With two trips, typing one part fills in the other.
// Mounted only while open.
export const TripSplitModal: React.FC<TripSplitModalProps> = ({ tx, trip, trips, transactions, iconFor, onSave, onClose }) => {
    const whole = Math.abs(tx.amount);
    const day = dateKeyOf(tx.date) ?? '';

    // Where the payment counts now, and at what part.
    const current = useMemo(() => {
        const parts = new Map<string, number>();
        for (const t of trips) {
            const entry = resolveTrip(t, transactions).entries.find(e => e.tx.id === tx.id && e.state === 'counted');
            if (entry) parts.set(t.id, entry.share);
        }
        return parts;
    }, [trips, transactions, tx.id]);

    const others = useMemo(
        () => trips.filter(t => t.id !== trip.id).sort((a, b) => distance(a, day) - distance(b, day) || b.startDate.localeCompare(a.startDate)),
        [trips, trip.id, day]
    );

    const [rows, setRows] = useState<Row[]>(() => {
        const start: Row[] = [{ trip, amount: roundRub(whole * (current.get(trip.id) ?? 1)) }];
        for (const t of others) if (current.has(t.id)) start.push({ trip: t, amount: roundRub(whole * current.get(t.id)!) });
        // Counted in this trip only: offer the nearest one to share with, at nothing yet.
        if (start.length === 1 && others[0]) start.push({ trip: others[0], amount: '0' });
        return start;
    });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [busy, onClose]);

    const amounts = rows.map(r => parseAmount(r.amount));
    const assigned = amounts.reduce((sum, a) => sum + (isFinite(a) ? a : 0), 0);
    const left = whole - assigned;
    const invalid = amounts.some(a => !isFinite(a) || a < 0) ? 'Amounts are numbers of rubles.'
        : left < -0.5 ? `The parts add up to more than the payment, by ${formatRub(-left)}.`
        : null;

    const setAmount = (index: number, text: string) => {
        setError(null);
        setRows(prev => {
            const next = prev.map((r, i) => (i === index ? { ...r, amount: text } : r));
            // Two trips: the other one takes the rest, so one number is enough.
            if (next.length === 2) {
                const typed = parseAmount(text);
                if (isFinite(typed) && typed >= 0 && typed <= whole) next[1 - index] = { ...next[1 - index], amount: roundRub(whole - typed) };
            }
            return next;
        });
    };

    const fill = (weights: number[]) => {
        const total = weights.reduce((s, w) => s + w, 0) || 1;
        const parts = weights.map(w => Math.round((whole * w) / total));
        parts[0] += Math.round(whole) - parts.reduce((s, p) => s + p, 0); // rounding goes to this trip
        setRows(prev => prev.map((r, i) => ({ ...r, amount: String(parts[i]) })));
        setError(null);
    };

    const addTrip = (id: string) => {
        const t = trips.find(x => x.id === id);
        if (t) setRows(prev => [...prev, { trip: t, amount: '0' }]);
    };
    const removeRow = (index: number) => setRows(prev => prev.filter((_, i) => i !== index));

    const save = async () => {
        if (invalid) return setError(invalid);
        // Parts are typed in whole rubles, so on a payment of 464.99 they can add up to a kopeck more
        // than it: scale them back to exactly the whole payment then.
        const fraction = amounts.map(a => (whole > 0 ? a / whole : 0));
        const sum = fraction.reduce((s, f) => s + f, 0);
        const parts: SplitPart[] = rows.map((r, i) => ({ trip: r.trip, share: sum > 1 ? fraction[i] / sum : fraction[i] }));
        // Trips the payment counted in that were taken out of the split stop counting it.
        for (const t of trips) if (current.has(t.id) && !rows.some(r => r.trip.id === t.id)) parts.push({ trip: t, share: 0 });
        setBusy(true);
        try {
            await onSave(parts);
        } catch (e) {
            setError(`Couldn't save: ${e instanceof Error ? e.message : String(e)}`);
            setBusy(false);
        }
    };

    const addable = others.filter(t => !rows.some(r => r.trip.id === t.id));
    const note = getTransactionNote(tx);

    return createPortal(
        <div className="fixed inset-0 z-[100] overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm fixed" onClick={() => !busy && onClose()} />
                <div className="relative z-10 bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-lg p-5 sm:p-7 animate-in zoom-in-95 duration-200">
                    <div className="flex items-start justify-between gap-3">
                        <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Scissors className="w-5 h-5 text-emerald-600" />Split between trips</h3>
                        <button onClick={onClose} disabled={busy} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400" aria-label="Close"><X className="w-5 h-5" /></button>
                    </div>

                    <div className="mt-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="font-semibold text-gray-900 truncate">{getTransactionTitle(tx)}</span>
                            <span className="font-bold text-gray-900 tabular-nums whitespace-nowrap">{formatRub(whole)}</span>
                        </div>
                        {note && <p className="text-xs text-gray-600 mt-0.5">{note}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">{tx.category} · {formatDate(tx.date)}</p>
                    </div>

                    <div className="mt-4 space-y-2">
                        {rows.map((row, i) => {
                            const amount = amounts[i];
                            const pct = whole > 0 && isFinite(amount) ? Math.round((amount / whole) * 100) : 0;
                            return (
                                <div key={row.trip.id} className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-base leading-none flex-shrink-0" aria-hidden>
                                        {iconFor(row.trip) ?? <Plane className="w-4 h-4 text-emerald-600" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-gray-900 truncate">{row.trip.name.trim()}{row.trip.id === trip.id && <span className="text-gray-400 font-normal"> · this trip</span>}</div>
                                        <div className="text-xs text-gray-400 tabular-nums">{formatTripRange(row.trip.startDate, row.trip.endDate)}</div>
                                    </div>
                                    <div className="relative w-28 flex-shrink-0">
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={row.amount}
                                            onChange={e => setAmount(i, e.target.value)}
                                            onFocus={e => e.target.select()}
                                            aria-label={`Part for ${row.trip.name}`}
                                            className="w-full pl-2.5 pr-6 py-2 bg-gray-50 border border-gray-200 rounded-lg text-right font-semibold tabular-nums focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 outline-none"
                                        />
                                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₽</span>
                                    </div>
                                    <span className="w-10 text-right text-xs text-gray-500 tabular-nums flex-shrink-0">{pct}%</span>
                                    {row.trip.id !== trip.id ? (
                                        <button onClick={() => removeRow(i)} className="p-1 rounded-md text-gray-300 hover:text-gray-600 hover:bg-gray-100 flex-shrink-0" aria-label={`Take ${row.trip.name} out of the split`}>
                                            <X className="w-4 h-4" />
                                        </button>
                                    ) : <span className="w-6 flex-shrink-0" />}
                                </div>
                            );
                        })}
                    </div>

                    {addable.length > 0 && (
                        <label className="mt-2 flex items-center gap-2 text-sm text-emerald-700">
                            <Plus className="w-4 h-4" />
                            <select
                                value=""
                                onChange={e => addTrip(e.target.value)}
                                className="flex-1 bg-transparent text-sm text-emerald-700 font-medium focus:outline-none cursor-pointer"
                                aria-label="Add a trip to the split"
                            >
                                <option value="" disabled>Add a trip…</option>
                                {addable.map(t => (
                                    <option key={t.id} value={t.id}>{t.name.trim()} · {formatTripRange(t.startDate, t.endDate)}</option>
                                ))}
                            </select>
                        </label>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-gray-400 mr-1">Quick:</span>
                        <button onClick={() => fill(rows.map(() => 1))} className="px-2.5 py-1 rounded-full border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50">Equally</button>
                        <button onClick={() => fill(rows.map(r => tripDayCount(r.trip)))} className="px-2.5 py-1 rounded-full border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50">By days of the trips</button>
                        <button onClick={() => fill(rows.map(r => (r.trip.id === trip.id ? 1 : 0)))} className="px-2.5 py-1 rounded-full border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50">All to this trip</button>
                    </div>

                    <p className={cn("mt-3 text-sm", invalid ? "text-red-600" : left > 0.5 ? "text-amber-700" : "text-gray-500")}>
                        {invalid ?? (left > 0.5 ? `${formatRub(left)} stays out of trips.` : 'The whole payment is shared out.')}
                    </p>
                    {error && !invalid && <p className="mt-1 text-sm text-red-600" role="alert">{error}</p>}

                    <div className="flex gap-3 mt-5">
                        <button onClick={onClose} disabled={busy} className="flex-1 px-5 py-3 border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors">Cancel</button>
                        <button
                            onClick={save}
                            disabled={busy || !!invalid}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-all shadow-md disabled:opacity-60"
                        >
                            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
