import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
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
        const formatted = new Intl.NumberFormat('en-US', {
            style: 'decimal',
            maximumFractionDigits: 0
        }).format(Math.abs(val));
        return `${formatted} ₽`;
    };


    // Sorting transactions by date descending (already requested by user)
    const sortedTransactions = [...transactions].sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return createPortal(
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
                                <div key={t.id} className="p-4 hover:bg-gray-50 transition-colors flex items-center gap-4">
                                    <div className="w-8 h-8 flex items-center justify-center bg-gray-50 rounded-lg text-[10px] font-bold text-gray-400 border border-gray-100 flex-shrink-0">
                                        {sortedTransactions.length - i}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-baseline gap-2 mb-0.5">
                                            <h4 className="text-[15px] font-bold text-gray-900 truncate tracking-tight">
                                                {t.tags || t.note || 'No description'}
                                            </h4>
                                            <div className="flex flex-col items-end flex-shrink-0">
                                                <span className="text-[15px] font-black text-gray-900 whitespace-nowrap tracking-tight">
                                                    {formatCurrency(t.amount)}
                                                </span>
                                                {t.originalAmount && t.originalCurrency && (
                                                    <span className="text-[10px] font-medium text-gray-400 whitespace-nowrap -mt-1 uppercase tracking-wider">
                                                        {(() => {
                                                            try {
                                                                const formattedOriginal = new Intl.NumberFormat('en-US', {
                                                                    style: 'decimal',
                                                                    maximumFractionDigits: 2
                                                                }).format(Math.abs(t.originalAmount));
                                                                return t.originalCurrency === 'RUB' ? `${formattedOriginal} ₽` : `${formattedOriginal} ${t.originalCurrency}`;
                                                            } catch (e) {
                                                                return `${new Intl.NumberFormat('en-US', {
                                                                    maximumFractionDigits: 2
                                                                }).format(Math.abs(t.originalAmount))} ${t.originalCurrency}`;
                                                            }
                                                        })()}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                            <div className="flex items-center gap-1 text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                                                <Calendar className="w-3 h-3 opacity-70" />
                                                {formatDate(t.date)}
                                            </div>
                                            
                                            {t.category && (
                                                <div className="flex items-center gap-1.5">
                                                    {(() => {
                                                        const Icon = getCategoryIcon(t.category);
                                                        const color = stringToColor(t.category);
                                                        return (
                                                            <div className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm", color.bg, color.text)}>
                                                                <Icon className="w-2.5 h-2.5" />
                                                                <span>{t.category}</span>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            )}
                                            
                                            {t.account && (
                                                <div className="flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded opacity-80">
                                                    <Banknote className="w-3 h-3" />
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
        </div>,
        document.body
    );
};
