import React, { useEffect } from 'react';
import { X, Calendar, Banknote } from 'lucide-react';
import type { Transaction } from '../types';

interface TransactionListModalProps {
    isOpen: boolean;
    onClose: () => void;
    category: string;
    tag: string;
    transactions: Transaction[];
}

export const TransactionListModal: React.FC<TransactionListModalProps> = ({
    isOpen,
    onClose,
    category,
    tag,
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

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        }).format(date);
    };

    // Sorting transactions by date descending (already requested by user)
    const sortedTransactions = [...transactions].sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            ></div>

            <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-2xl">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            {category}
                            <span className="text-gray-400">/</span>
                            <span className="text-emerald-600">{tag}</span>
                        </h3>
                        <p className="text-sm text-gray-500 mt-0.5">
                            {transactions.length} transactions found
                        </p>
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
                            {sortedTransactions.map((t) => (
                                <div key={t.id} className="p-4 hover:bg-gray-50 transition-colors flex items-start gap-4">
                                    <div className="min-w-[40px] flex flex-col items-center justify-center bg-gray-100 rounded-lg p-2 text-xs font-medium text-gray-500">
                                        <span className="text-lg font-bold text-gray-900">
                                            {new Date(t.date).getDate()}
                                        </span>
                                        <span>
                                            {new Date(t.date).toLocaleDateString('en-US', { month: 'short' })}
                                        </span>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start">
                                            <p className="text-sm font-medium text-gray-900 truncate">
                                                {t.note || 'No description'}
                                            </p>
                                            <div className="flex flex-col items-end ml-4">
                                                <span className="text-sm font-bold text-gray-900 whitespace-nowrap">
                                                    {formatCurrency(t.amount)}
                                                </span>
                                                {t.originalAmount && t.originalCurrency && (
                                                    <span className="text-xs text-gray-400 whitespace-nowrap">
                                                        {new Intl.NumberFormat('ru-RU', {
                                                            style: 'currency',
                                                            currency: t.originalCurrency,
                                                            maximumFractionDigits: 2
                                                        }).format(Math.abs(t.originalAmount))}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 mt-1">
                                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                                <Calendar className="w-3.5 h-3.5" />
                                                {formatDate(t.date)}
                                            </div>
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
