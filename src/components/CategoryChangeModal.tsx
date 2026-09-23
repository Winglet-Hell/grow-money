import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Transaction } from '../types';
import { cn, formatDate, getTransactionTitle, stringToColor } from '../lib/utils';
import { getCategoryIcon } from '../lib/categoryIcons';
import { formatDelta } from '../lib/periods';
import { SIDE_COLORS, formatDayKey, perMonth, type RangeStats } from '../lib/milestones';

// The operations behind one line of "What changed": the category on each side of the
// comparison, later side first, so a jump like "Tech +27 000 a month" can be traced to
// the purchases that made it.

export interface ChangeSide {
    side: 'a' | 'b';
    title: string;              // the chapter's name
    range: RangeStats;          // the part of it being compared
    transactions: Transaction[];
}

interface CategoryChangeModalProps {
    category: string;
    sides: ChangeSide[]; // in display order
    isPrivacyMode: boolean;
    onClose: () => void;
}

const rub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const original = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

export function CategoryChangeModal({ category, sides, isPrivacyMode, onClose }: CategoryChangeModalProps) {
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

    const money = (n: number) => (isPrivacyMode ? '••••' : rub.format(Math.round(n)));
    const monthly = (s: ChangeSide) => perMonth(s.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0), s.range.days);
    const a = sides.find(s => s.side === 'a');
    const b = sides.find(s => s.side === 'b');
    const change = a && b ? formatDelta(monthly(b), monthly(a)) : null;

    const renderIcon = () => {
        const Icon = getCategoryIcon(category);
        const color = stringToColor(category);
        return (
            <span className={cn("p-2 rounded-lg flex-shrink-0", color.bg, color.text)}>
                <Icon className="w-4 h-4" />
            </span>
        );
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="category-change-title"
                className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
            >
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 bg-gray-50/50 rounded-t-2xl">
                    <div className="flex items-center gap-3 min-w-0">
                        {renderIcon()}
                        <div className="min-w-0">
                            <h3 id="category-change-title" className="text-lg font-semibold text-gray-900 truncate">{category}</h3>
                            {a && b && (
                                <p className="text-sm text-gray-500">
                                    A month: {money(monthly(a))} → {money(monthly(b))}
                                    {change && <span className="font-medium"> · {change}</span>}
                                </p>
                            )}
                        </div>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1">
                    {sides.map(s => {
                        const total = s.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
                        const sorted = [...s.transactions].sort((x, y) => y.date.localeCompare(x.date) || (x.index ?? 0) - (y.index ?? 0));
                        return (
                            <section key={s.side}>
                                <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm px-6 py-2.5 border-b border-gray-100">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span
                                            className="flex-shrink-0 w-5 h-5 rounded-md text-[11px] font-bold flex items-center justify-center text-white"
                                            style={{ backgroundColor: SIDE_COLORS[s.side].bar }}
                                        >
                                            {s.side.toUpperCase()}
                                        </span>
                                        <span className="font-semibold text-gray-900 truncate">{s.title}</span>
                                    </div>
                                    <div className="mt-0.5 text-xs text-gray-500 tabular-nums">
                                        <span className="whitespace-nowrap">{formatDayKey(s.range.from)} – {formatDayKey(s.range.to)}</span>
                                        {' · '}
                                        <span className="whitespace-nowrap">{s.transactions.length} {s.transactions.length === 1 ? 'operation' : 'operations'}</span>
                                        {' · '}
                                        <span className="whitespace-nowrap">{money(total)}, {money(monthly(s))} a month</span>
                                    </div>
                                </div>
                                {sorted.length === 0 ? (
                                    <p className="px-6 py-4 text-sm text-gray-400">Nothing in this category.</p>
                                ) : (
                                    <div className="divide-y divide-gray-50">
                                        {sorted.map(t => (
                                            <div key={t.id} className="px-6 py-2.5 flex items-center gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium text-gray-900 truncate">{getTransactionTitle(t)}</div>
                                                    <div className="text-xs text-gray-400 truncate">
                                                        {formatDate(t.date)}{t.account ? ` · ${t.account}` : ''}
                                                    </div>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <div className="text-sm font-semibold text-gray-900 tabular-nums">{money(Math.abs(t.amount))}</div>
                                                    {t.originalAmount !== undefined && t.originalCurrency && t.originalCurrency !== 'RUB' && (
                                                        <div className="text-[11px] text-gray-400 tabular-nums">
                                                            {isPrivacyMode ? '••••' : `${original.format(Math.abs(t.originalAmount))} ${t.originalCurrency}`}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>
            </div>
        </div>,
        document.body
    );
}
