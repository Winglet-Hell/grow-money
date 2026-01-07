import React, { useEffect } from 'react';
import { X, Calendar, Banknote } from 'lucide-react';
import type { Transaction } from '../types';
import { formatDate, stringToColor, cn } from '../lib/utils';
import { getCategoryIcon } from '../lib/categoryIcons';

interface TransactionListModalProps {
    isOpen: boolean;
    onClose: () => void;
    category?: string;
    tag?: string;
    title?: React.ReactNode;
    subtitle?: React.ReactNode;
    transactions: Transaction[];
}

export const TransactionListModal: React.FC<TransactionListModalProps> = ({
    isOpen,
    onClose,
    category,
    tag,
    title,
    subtitle,
    transactions
}) => {
    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            maximumFractionDigits: 0
        }).format(Math.abs(val));
    };


    // Sorting transactions by date descending (already requested by user)
    const sortedTransactions = [...transactions].sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            ></div>

            <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-2xl">
                    <div>
                        {title ? (
                            <>
                                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                    {title}
                                </h3>
                                {subtitle && (
                                    <p className="text-sm text-gray-500 mt-0.5">
                                        {subtitle}
                                    </p>
                                )}
                            </>
                        ) : (
                            <>
                                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                    {category}
                                    <span className="text-gray-400">/</span>
                                    <span className="text-emerald-600">{tag}</span>
                                </h3>
                                <p className="text-sm text-gray-500 mt-0.5">
                                    {transactions.length} transactions found
                                </p>
                            </>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* List */}
                <div className="overflow-y-auto flex-1 p-0">
                    {sortedTransactions.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">
                            No transactions found.
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-50">
                            {sortedTransactions.map((t, i) => (
                                <div key={t.id} className="p-4 hover:bg-gray-50 transition-colors flex items-start gap-4">
                                    <div className="min-w-[40px] flex flex-col items-center justify-center bg-gray-100 rounded-lg p-2 text-xs font-medium text-gray-500 h-full self-stretch">
                                        <span className="text-lg font-bold text-gray-900">
                                            {sortedTransactions.length - i}
                                        </span>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start">
                                            <p className="text-sm font-medium text-gray-900 truncate">
                                                {t.tags || t.note || 'No description'}
                                            </p>
                                            <div className="flex flex-col items-end ml-4">
                                                <span className="text-sm font-bold text-gray-900 whitespace-nowrap">
                                                    {formatCurrency(t.amount)}
                                                </span>
                                                {t.originalAmount && t.originalCurrency && (
                                                    <span className="text-xs text-gray-400 whitespace-nowrap">
                                                        {(() => {
                                                            try {
                                                                return new Intl.NumberFormat('ru-RU', {
                                                                    style: 'currency',
                                                                    currency: t.originalCurrency,
                                                                    maximumFractionDigits: 2
                                                                }).format(Math.abs(t.originalAmount));
                                                            } catch (e) {
                                                                // Fallback for invalid currency codes (e.g. USDT)
                                                                return `${new Intl.NumberFormat('ru-RU', {
                                                                    maximumFractionDigits: 2,
                                                                    minimumFractionDigits: 2
                                                                }).format(Math.abs(t.originalAmount))} ${t.originalCurrency}`;
                                                            }
                                                        })()}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                                            {/* Date is redundant here too if we are in daily view, but useful in general list. 
                                                However, user said "no need to duplicate date 500 times". 
                                                If title is present (daily view context), let's hide date or keep it? 
                                                User specifically complained about the big date box. 
                                                Let's keep the small date here for reference or remove if strictly daily view.
                                                Actually, let's leave it removed from the big box, and maybe keep here for context or remove?
                                                If I look at the requested change: "No duplicated date 500 times... write number in order".
                                                This applies to the list item left side.
                                                I will keep the small date here as it is less intrusive, or remove it?
                                                Let's keep it for now as it wasn't explicitly asked to be removed from everywhere, just the main indicator.
                                                Actually, finding the line 147-150 block.
                                            */}
                                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                                <Calendar className="w-3.5 h-3.5" />
                                                {formatDate(t.date)}
                                            </div>
                                            {t.category && (
                                                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                                    {(() => {
                                                        const Icon = getCategoryIcon(t.category);
                                                        const color = stringToColor(t.category);
                                                        return (
                                                            <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-full", color.bg, color.text)}>
                                                                <Icon className="w-3 h-3" />
                                                                <span className="font-medium">{t.category}</span>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            )}
                                            {t.tags && t.note && (
                                                <div className="flex items-center gap-1.5 text-xs text-gray-500 max-w-[200px]">
                                                    <span className="truncate" title={t.note}>
                                                        {t.note}
                                                    </span>
                                                </div>
                                            )}
                                            {t.account && (
                                                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                                    <Banknote className="w-3.5 h-3.5" />
                                                    {t.account}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex justify-between items-center text-sm text-gray-500">
                    <span>Total</span>
                    <span className="text-lg font-bold text-gray-900">
                        {formatCurrency(transactions.reduce((acc, t) => acc + Math.abs(t.amount), 0))}
                    </span>
                </div>
            </div>
        </div>
    );
};
