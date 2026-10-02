import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Plane, Trash2 } from 'lucide-react';
import { ICON_CHOICES } from '../lib/tripIcons';
import { cn } from '../lib/utils';

export interface TripFormValues {
    name: string;
    startDate: string;
    endDate: string;
    icon: string | null; // null: let the app choose
    budget: number | null; // RUB for the whole trip; null: no budget
}

interface TripFormModalProps {
    title: string;
    submitLabel: string;
    initial?: TripFormValues;
    autoIcon: (values: TripFormValues) => string | null; // what "Auto" would show for these values
    onSubmit: (values: TripFormValues) => Promise<void>;
    onClose: () => void;
    onDelete?: () => void; // shown only when editing
}

const inputClass = "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all font-medium";

// Creating a trip and changing one later are the same form: a name and the days it covers.
// Mounted only while open, so it always starts from `initial`.
export const TripFormModal: React.FC<TripFormModalProps> = ({ title, submitLabel, initial, autoIcon, onSubmit, onClose, onDelete }) => {
    const [values, setValues] = useState<TripFormValues>(() => initial ?? { name: '', startDate: '', endDate: '', icon: null, budget: null });
    const [budgetText, setBudgetText] = useState(() => (initial?.budget != null ? String(initial.budget) : ''));
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [busy, onClose]);

    const set = (key: 'name' | 'startDate' | 'endDate') => (e: React.ChangeEvent<HTMLInputElement>) => {
        setValues(v => ({ ...v, [key]: e.target.value }));
        setError(null);
    };
    const setIcon = (icon: string | null) => setValues(v => ({ ...v, icon }));
    const auto = autoIcon(values);
    const customTyped = values.icon && !ICON_CHOICES.includes(values.icon) ? values.icon : '';
    const iconButton = (selected: boolean) => cn(
        "w-10 h-10 rounded-xl border flex items-center justify-center text-xl transition-colors",
        selected ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20" : "border-gray-200 bg-white hover:bg-gray-50"
    );

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const name = values.name.trim();
        if (!name) return setError('Give the trip a name.');
        if (!values.startDate || !values.endDate) return setError('Pick the first and the last day.');
        if (values.endDate < values.startDate) return setError('The last day comes before the first one.');
        const budgetDigits = budgetText.replace(/[\s\u00a0₽]/g, '').replace(',', '.');
        const budget = budgetDigits ? Number(budgetDigits) : null;
        if (budget !== null && (!isFinite(budget) || budget <= 0)) return setError('The budget should be an amount in rubles, like 150 000.');
        setBusy(true);
        try {
            await onSubmit({ ...values, name, budget });
        } catch (err) {
            setError(`Couldn't save: ${err instanceof Error ? err.message : String(err)}`);
            setBusy(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm fixed" onClick={() => !busy && onClose()} />
                <div className="relative z-10 bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-xl p-6 sm:p-8 animate-in zoom-in-95 duration-200">
                    <h3 className="text-2xl font-bold text-gray-900 mb-6">{title}</h3>
                    <form onSubmit={submit} noValidate className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="trip-name">Trip name</label>
                            <input
                                id="trip-name"
                                type="text"
                                value={values.name}
                                onChange={set('name')}
                                placeholder="e.g. Japan, or Bangkok #friends"
                                className={`${inputClass} placeholder:text-gray-400`}
                                autoFocus
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="trip-start">First day</label>
                                <input id="trip-start" type="date" value={values.startDate} onChange={set('startDate')} className={`${inputClass} font-sans`} />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="trip-end">Last day</label>
                                <input id="trip-end" type="date" value={values.endDate} min={values.startDate || undefined} onChange={set('endDate')} className={`${inputClass} font-sans`} />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="trip-budget">
                                Budget <span className="font-normal text-gray-400">— optional, the whole trip with bookings, ₽</span>
                            </label>
                            <input
                                id="trip-budget"
                                type="text"
                                inputMode="decimal"
                                value={budgetText}
                                onChange={e => { setBudgetText(e.target.value); setError(null); }}
                                placeholder="e.g. 150 000"
                                className={`${inputClass} placeholder:text-gray-400 tabular-nums`}
                            />
                        </div>
                        <div>
                            <span className="block text-sm font-semibold text-gray-700 mb-2">Icon</span>
                            <div className="flex flex-wrap items-center gap-1.5">
                                <button type="button" onClick={() => setIcon(null)} className={cn(iconButton(!values.icon), "w-auto px-2.5 gap-1.5")} title="Chosen by the app: the country's flag, or a picture of the place for trips at home">
                                    {auto ?? <Plane className="w-4 h-4 text-emerald-600" />}
                                    <span className="text-xs font-semibold text-gray-600">Auto</span>
                                </button>
                                {ICON_CHOICES.map(icon => (
                                    <button key={icon} type="button" onClick={() => setIcon(icon)} className={iconButton(values.icon === icon)} aria-label={`Icon ${icon}`}>
                                        {icon}
                                    </button>
                                ))}
                                <input
                                    type="text"
                                    value={customTyped}
                                    onChange={e => setIcon(e.target.value.trim() || null)}
                                    placeholder="Any"
                                    maxLength={8}
                                    aria-label="Any other emoji"
                                    className={cn(iconButton(!!customTyped), "w-16 text-center text-base placeholder:text-xs placeholder:text-gray-400 focus:outline-none")}
                                />
                            </div>
                        </div>
                        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
                        <div className="flex flex-wrap items-center gap-3 pt-4">
                            {onDelete && (
                                <button
                                    type="button"
                                    onClick={onDelete}
                                    disabled={busy}
                                    className="inline-flex items-center gap-1.5 px-3 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-xl transition-colors mr-auto"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Delete trip
                                </button>
                            )}
                            <div className={`flex gap-3 ${onDelete ? '' : 'w-full'}`}>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    disabled={busy}
                                    className="flex-1 px-5 py-3 border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 hover:border-gray-300 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={busy}
                                    className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-all shadow-md hover:shadow-lg active:scale-[0.98] disabled:opacity-70 whitespace-nowrap"
                                >
                                    {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {submitLabel}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>,
        document.body
    );
};
