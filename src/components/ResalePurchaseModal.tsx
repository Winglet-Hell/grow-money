import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Trash2, X } from 'lucide-react';
import type { ResalePurchaseEntry } from '../types';
import type { PurchaseCandidate, SaleItem } from '../lib/resale';
import { CurrencySelect } from './CurrencySelect';
import { useHistoricalRates } from '../hooks/useHistoricalRates';
import { useLiveRates } from '../hooks/useLiveRates';
import { FIRST_SNAPSHOT_DATE, makeRateLookup } from '../lib/fxBenchmark';
import { formatRubRate, normalizeCurrencyCode } from '../lib/currencies';
import { formatDayKey } from '../lib/milestones';
import { formatNative, formatRub } from '../lib/tripFormat';
import { getCategoryColor, getCategoryIcon } from '../lib/categoryIcons';
import { cn } from '../lib/utils';

interface ResalePurchaseModalProps {
    item: SaleItem;
    entry: ResalePurchaseEntry | undefined; // what is saved for this sale now
    candidates: PurchaseCandidate[];        // statement purchases it could be, likeliest first
    statementStart: string | null;          // first day of the imported statement
    isPrivacyMode: boolean;
    onSave: (entry: ResalePurchaseEntry) => void;
    onRemove: () => void;
    onClose: () => void;
}

type Mode = 'manual' | 'pick';

/** "10 990", "10990,5", "1,299.00" → a number; null when it isn't a price. */
function parsePrice(input: string): number | null {
    const s = input.replace(/\s/g, ''); // no-break spaces too, as in a pasted "10 990"
    const normalized = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
    const n = Number(normalized);
    return normalized && isFinite(n) && n > 0 ? n : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Mounted only while open, so every opening starts from what is saved for the sale.
export function ResalePurchaseModal({ item, entry, candidates, statementStart, isPrivacyMode, onSave, onRemove, onClose }: ResalePurchaseModalProps) {
    const manual = entry && !('purchaseId' in entry) ? entry : undefined;
    const likely = candidates.find(c => c.shared > 0);
    const [mode, setMode] = useState<Mode>(() =>
        candidates.length === 0 ? 'manual'
            : entry ? ('purchaseId' in entry ? 'pick' : 'manual')
                : likely ? 'pick' : 'manual');
    const [picked, setPicked] = useState<string | null>(() => (entry && 'purchaseId' in entry ? entry.purchaseId : likely?.id ?? null));
    const [price, setPrice] = useState(() => (manual ? String(manual.price ?? manual.amount) : ''));
    const [currency, setCurrency] = useState(() => manual?.currency ?? 'RUB');
    const [date, setDate] = useState(manual?.date ?? '');
    const [place, setPlace] = useState(manual?.place ?? '');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', onKey);
        };
    }, [onClose]);

    // A price in another currency is turned into rubles at its own day's rate, as the
    // statement does for every row.
    const code = normalizeCurrencyCode(currency) || 'RUB';
    const needsRate = code !== 'RUB';
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
    const rates = useHistoricalRates(needsRate && validDate ? [date] : [], needsRate ? [code] : []);
    const live = useLiveRates();
    const rate = !needsRate ? 1
        : validDate ? makeRateLookup(rates.snapshots, live.isLive ? { rates: live.rates, date: live.date } : undefined)(date, code)
            : null;
    const amount = parsePrice(price);
    const rub = amount !== null && rate ? amount * rate : null;

    const money = (n: number) => (isPrivacyMode ? '••••' : formatRub(Math.round(n)));
    const native = (n: number, c: string) => (isPrivacyMode ? '••••' : formatNative(n, c));

    const rateNote = !needsRate ? null
        : !validDate ? 'Pick the day — the price turns into rubles at that day’s rate.'
            : rate === null ? (
                rates.isLoading ? 'Looking up the rate…'
                    : date < FIRST_SNAPSHOT_DATE ? `Rates go back to ${formatDayKey(FIRST_SNAPSHOT_DATE)} — enter this price in rubles.`
                        : 'No rate for that day — enter the price in rubles.'
            )
                : rub !== null ? `≈ ${money(rub)} at the rate of ${formatDayKey(date)}`
                    : `${code} was ${formatRubRate(rate, code)} on ${formatDayKey(date)}`;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (mode === 'pick') {
            const c = candidates.find(x => x.id === picked);
            if (!c) {
                setError('Pick the purchase');
                return;
            }
            onSave({ purchaseId: c.id, ...(c.key ? { sameAs: c.key } : {}) });
            return;
        }
        if (amount === null) {
            setError('Enter what it cost');
            return;
        }
        if (!validDate) {
            setError('Pick the day you bought it');
            return;
        }
        if (date > item.sale.day) {
            setError(`It was sold on ${formatDayKey(item.sale.day)}, so it was bought before that`);
            return;
        }
        if (rub === null) {
            setError(rates.isLoading ? 'Still looking up the rate — try again in a moment' : 'No rate for that day — enter the price in rubles');
            return;
        }
        const cleanPlace = place.trim();
        onSave({
            date,
            amount: round2(rub),
            ...(needsRate ? { price: amount, currency: code } : {}),
            ...(cleanPlace ? { place: cleanPlace } : {}),
        });
    };

    const inputClass = "w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all placeholder:text-gray-400";
    const tab = (id: Mode, label: string) => (
        <button
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => { setMode(id); setError(null); }}
            className={cn(
                "flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                mode === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
            )}
        >
            {label}
        </button>
    );

    return createPortal(
        <div className="fixed inset-0 z-[100] overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
                <form
                    onSubmit={submit}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="resale-purchase-title"
                    className="relative z-10 w-full max-w-xl bg-white rounded-2xl shadow-xl animate-in fade-in zoom-in-95 duration-200"
                >
                    <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3 bg-gray-50/50 rounded-t-2xl">
                        <div className="min-w-0">
                            <h3 id="resale-purchase-title" className="text-lg font-semibold text-gray-900 truncate">
                                Purchase of {item.name || 'this sale'}
                            </h3>
                            <p className="text-xs text-gray-500 truncate tabular-nums">
                                Sold {formatDayKey(item.sale.day)} for {money(item.sale.rub)}
                                {item.sale.native && ` (${native(item.sale.native.amount, item.sale.native.currency)})`}
                                {item.sale.place && ` · ${item.sale.place}`}
                            </p>
                        </div>
                        <button type="button" onClick={onClose} aria-label="Close" className="p-2 -mr-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6 space-y-5">
                        {candidates.length > 0 && (
                            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl" role="tablist">
                                {tab('manual', 'Bought before the statement')}
                                {tab('pick', 'In the statement')}
                            </div>
                        )}

                        {mode === 'manual' ? (
                            <>
                                <div>
                                    <label htmlFor="resale-price" className="block text-sm font-medium text-gray-700 mb-1.5">What it cost</label>
                                    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_9rem] gap-2">
                                        <input
                                            id="resale-price"
                                            type="text"
                                            inputMode="decimal"
                                            value={price}
                                            onChange={e => { setPrice(e.target.value); setError(null); }}
                                            placeholder="25 990"
                                            className={cn(inputClass, "font-medium tabular-nums")}
                                            autoFocus
                                        />
                                        <CurrencySelect value={code} onChange={c => { setCurrency(c); setError(null); }} />
                                    </div>
                                    {rateNote && <p className="mt-1.5 text-xs text-gray-500 tabular-nums">{rateNote}</p>}
                                </div>

                                <div>
                                    <label htmlFor="resale-date" className="block text-sm font-medium text-gray-700 mb-1.5">When</label>
                                    <input
                                        id="resale-date"
                                        type="date"
                                        value={date}
                                        max={item.sale.day}
                                        onChange={e => { setDate(e.target.value); setError(null); }}
                                        className={cn(inputClass, "font-medium font-sans")}
                                    />
                                    {statementStart && (
                                        <p className="mt-1.5 text-xs text-gray-400">
                                            Your statement starts {formatDayKey(statementStart)}; a rough day is fine, it only sets how long you had it.
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label htmlFor="resale-place" className="block text-sm font-medium text-gray-700 mb-1.5">
                                        Where <span className="font-normal text-gray-400">(optional)</span>
                                    </label>
                                    <input
                                        id="resale-place"
                                        type="text"
                                        value={place}
                                        maxLength={60}
                                        onChange={e => setPlace(e.target.value)}
                                        placeholder="Apple Store"
                                        className={inputClass}
                                    />
                                </div>
                            </>
                        ) : (
                            <div>
                                <p className="text-xs text-gray-500 mb-2">
                                    Bought by the day of the sale and not matched to another one. Gadgets are all here; other
                                    purchases when their comment shares a word with this one.
                                </p>
                                <div className="max-h-72 overflow-y-auto -mx-2 px-2 space-y-1" role="radiogroup" aria-label="Purchase">
                                    {candidates.map(c => {
                                        const category = c.side.tx?.category ?? '';
                                        const Icon = getCategoryIcon(category);
                                        const color = getCategoryColor(category, 'expense');
                                        const isPicked = picked === c.id;
                                        return (
                                            <button
                                                key={c.id}
                                                type="button"
                                                role="radio"
                                                aria-checked={isPicked}
                                                onClick={() => { setPicked(c.id); setError(null); }}
                                                className={cn(
                                                    "w-full flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition-colors",
                                                    isPicked ? "border-emerald-500 bg-emerald-50" : "border-gray-100 hover:bg-gray-50"
                                                )}
                                            >
                                                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", color.bg, color.text)}>
                                                    <Icon className="w-4 h-4" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className={cn("text-sm font-medium truncate", c.name ? "text-gray-900" : "text-gray-400 italic")}>{c.name || 'No comment'}</div>
                                                    <div className="text-xs text-gray-400 truncate tabular-nums">
                                                        {formatDayKey(c.side.day)}{c.side.place && ` · ${c.side.place}`}
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <div className="text-sm font-semibold text-gray-900 tabular-nums">{money(c.side.rub)}</div>
                                                    {c.side.native && <div className="text-xs text-gray-400 tabular-nums">{native(c.side.native.amount, c.side.native.currency)}</div>}
                                                </div>
                                                <Check className={cn("w-4 h-4 shrink-0", isPicked ? "text-emerald-600" : "text-transparent")} />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {error && <p className="text-sm text-red-600">{error}</p>}
                    </div>

                    <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex justify-between items-center gap-3">
                        {entry ? (
                            <button
                                type="button"
                                onClick={onRemove}
                                className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
                            >
                                <Trash2 className="w-4 h-4" /> Remove
                            </button>
                        ) : <span />}
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
