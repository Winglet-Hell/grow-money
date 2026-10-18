import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import { CurrencySelect } from './CurrencySelect';
import { DEFAULT_GOAL_ICON, GOAL_ICON_CHOICES, PRIORITIES, type GoalPriority, type GoalValues } from '../lib/goals';
import { cn } from '../lib/utils';

interface GoalFormModalProps {
    title: string;
    submitLabel: string;
    initial?: GoalValues;
    rubPerUnit: (currency: string) => number | null; // today's rate, for the "≈ ₽" line
    isPrivacyMode: boolean;
    onSubmit: (values: GoalValues) => Promise<void>;
    onClose: () => void;
    onDelete?: () => void;            // when editing
    onReached?: () => Promise<void>;  // when editing a goal that isn't reached yet
}

const inputClass = "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all font-medium";
const rub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const plain = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 8 });

const PRIORITY_HINT: Record<GoalPriority, string> = {
    High: 'gets the net worth first',
    Medium: 'after the High goals',
    Low: 'gets what is left',
};

// "15 000 000", "2 499,99", "0.5" → a number; null when it isn't one.
const parseAmount = (text: string): number | null => {
    const digits = text.replace(/[\s\u00a0\u202f₽]/g, '').replace(',', '.');
    if (!digits) return null;
    const value = Number(digits);
    return isFinite(value) ? value : null;
};

// Adding a goal and changing one are the same form. Mounted only while open, so it always
// starts from `initial`.
export const GoalFormModal: React.FC<GoalFormModalProps> = ({ title, submitLabel, initial, rubPerUnit, isPrivacyMode, onSubmit, onClose, onDelete, onReached }) => {
    const [values, setValues] = useState<GoalValues>(() => initial ?? { name: '', price: 0, currency: 'RUB', priority: 'Medium', icon: DEFAULT_GOAL_ICON });
    const [priceText, setPriceText] = useState(() => (initial ? plain.format(initial.price) : ''));
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [busy, onClose]);

    const set = <K extends keyof GoalValues>(key: K, value: GoalValues[K]) => {
        setValues(v => ({ ...v, [key]: value }));
        setError(null);
    };
    const customTyped = values.icon && !GOAL_ICON_CHOICES.includes(values.icon) ? values.icon : '';
    const iconButton = (selected: boolean) => cn(
        "w-10 h-10 rounded-xl border flex items-center justify-center text-xl transition-colors",
        selected ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20" : "border-gray-200 bg-white hover:bg-gray-50"
    );

    const price = parseAmount(priceText);
    const rate = values.currency === 'RUB' ? 1 : rubPerUnit(values.currency);
    const priceHint = values.currency === 'RUB' || price === null || price <= 0
        ? null
        : rate
            ? `≈ ${isPrivacyMode ? '••••••' : rub.format(price * rate)} at today's rate`
            : `No rate for ${values.currency} yet: the goal can't get a date until there is one.`;

    const run = async (action: () => Promise<void>) => {
        setBusy(true);
        try {
            await action();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setBusy(false);
        }
    };

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const name = values.name.trim();
        if (!name) return setError('Give the goal a name.');
        if (price === null || price <= 0) return setError('The price should be an amount, like 150 000.');
        run(() => onSubmit({ ...values, name, price }));
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm fixed" onClick={() => !busy && onClose()} />
                <div className="relative z-10 bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-xl p-6 sm:p-8 animate-in zoom-in-95 duration-200">
                    <h3 className="text-2xl font-bold text-gray-900 mb-6">{title}</h3>
                    <form onSubmit={submit} noValidate className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="goal-name">Goal</label>
                            <input
                                id="goal-name"
                                type="text"
                                value={values.name}
                                onChange={e => set('name', e.target.value)}
                                placeholder="e.g. MacBook Pro, or Time to retire"
                                className={`${inputClass} placeholder:text-gray-400`}
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="goal-price">Price</label>
                            <div className="flex gap-2 items-stretch">
                                <input
                                    id="goal-price"
                                    type="text"
                                    inputMode="decimal"
                                    value={priceText}
                                    onChange={e => { setPriceText(e.target.value); setError(null); }}
                                    placeholder="e.g. 150 000"
                                    className={`${inputClass} placeholder:text-gray-400 tabular-nums flex-1 min-w-0`}
                                />
                                <div className="w-36 flex-shrink-0">
                                    <CurrencySelect value={values.currency} onChange={code => set('currency', code)} />
                                </div>
                            </div>
                            {priceHint && <p className={cn("text-xs mt-1.5", rate ? "text-gray-500" : "text-amber-600")}>{priceHint}</p>}
                        </div>
                        <div>
                            <span className="block text-sm font-semibold text-gray-700 mb-2">
                                Priority <span className="font-normal text-gray-400">— {PRIORITY_HINT[values.priority]}</span>
                            </span>
                            <div className="flex gap-2">
                                {PRIORITIES.map(p => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => set('priority', p)}
                                        aria-pressed={values.priority === p}
                                        className={cn(
                                            "flex-1 py-2.5 text-sm font-semibold rounded-xl border transition-colors",
                                            values.priority === p
                                                ? "bg-emerald-50 border-emerald-500 text-emerald-700 ring-2 ring-emerald-500/20"
                                                : "border-gray-200 text-gray-600 hover:bg-gray-50"
                                        )}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <span className="block text-sm font-semibold text-gray-700 mb-2">Icon</span>
                            <div className="flex flex-wrap items-center gap-1.5">
                                {GOAL_ICON_CHOICES.map(icon => (
                                    <button key={icon} type="button" onClick={() => set('icon', icon)} className={iconButton(values.icon === icon)} aria-label={`Icon ${icon}`}>
                                        {icon}
                                    </button>
                                ))}
                                <input
                                    type="text"
                                    value={customTyped}
                                    onChange={e => set('icon', e.target.value.trim() || DEFAULT_GOAL_ICON)}
                                    placeholder="Any"
                                    maxLength={8}
                                    aria-label="Any other emoji"
                                    className={cn(iconButton(!!customTyped), "w-16 text-center text-base placeholder:text-xs placeholder:text-gray-400 focus:outline-none")}
                                />
                            </div>
                        </div>
                        {onReached && (
                            <button
                                type="button"
                                onClick={() => run(onReached)}
                                disabled={busy}
                                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-60"
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                Mark as reached today
                            </button>
                        )}
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
                                    Delete goal
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
