import React, { useState, useMemo } from 'react';
import type { Transaction } from '../types';
import { cn, stringToColor } from '../lib/utils';
import { getCategoryIcon } from '../lib/categoryIcons';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown } from 'lucide-react';

interface TransactionTableProps {
    transactions: Transaction[];
}

type SortKey = 'date' | 'amount' | 'category';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
    key: SortKey;
    direction: SortDirection;
}

export const TransactionTable: React.FC<TransactionTableProps> = ({ transactions }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [visibleCount, setVisibleCount] = useState(20);
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'date', direction: 'desc' });

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    const filteredAndSortedTransactions = useMemo(() => {
        let result = [...transactions];

        // 1. Filter
        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            result = result.filter(t =>
                (t.category && t.category.toLowerCase().includes(lowerTerm)) ||
                (t.note && t.note.toLowerCase().includes(lowerTerm)) ||
                (t.account && t.account.toLowerCase().includes(lowerTerm)) ||
                (t.amount.toString().includes(lowerTerm)) ||
                (t.tags && t.tags.toLowerCase().includes(lowerTerm))
            );
        }

        // 2. Sort
        result.sort((a, b) => {
            let comparison = 0;
            switch (sortConfig.key) {
                case 'date':
                    comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
                    break;
                case 'amount':
                    comparison = Math.abs(a.amount) - Math.abs(b.amount);
                    break;
                case 'category':
                    comparison = (a.category || '').localeCompare(b.category || '');
                    break;
            }
            return sortConfig.direction === 'asc' ? comparison : -comparison;
        });

        return result;
    }, [transactions, searchTerm, sortConfig]);

    const paginatedTransactions = useMemo(() => {
        return filteredAndSortedTransactions.slice(0, visibleCount);
    }, [filteredAndSortedTransactions, visibleCount]);

    // Group only if sorting by date (or default)
    // If sorting by amount/category, grouping by date is confusing, so we skip it.
    const groupedTransactions = useMemo(() => {
        if (sortConfig.key !== 'date') return null;

        const groups: Record<string, Transaction[]> = {};
        paginatedTransactions.forEach(t => {
            const dateObj = new Date(t.date);
            const dateKey = isNaN(dateObj.getTime())
                ? t.date
                : dateObj.toLocaleDateString('ru-RU');

            if (!groups[dateKey]) {
                groups[dateKey] = [];
            }
            groups[dateKey].push(t);
        });

        // We need to maintain the sort order of groups based on the transactions inside them
        // Since paginatedTransactions is already sorted by date, we can just iterate keys
        // But object keys iteration order isn't guaranteed.
        // Let's reconstruct based on unique keys encountered in order.
        const orderedKeys = Array.from(new Set(paginatedTransactions.map(t => {
            const d = new Date(t.date);
            return isNaN(d.getTime()) ? t.date : d.toLocaleDateString('ru-RU');
        })));

        return orderedKeys.map(key => ({ date: key, items: groups[key] }));
    }, [paginatedTransactions, sortConfig.key]);

    const handleLoadMore = () => {
        setVisibleCount(prev => prev + 20);
    };

    const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
        if (sortConfig.key !== columnKey) return <ArrowUpDown className="w-3 h-3 text-gray-300" />;
        return sortConfig.direction === 'asc'
            ? <ArrowUp className="w-3 h-3 text-emerald-600" />
            : <ArrowDown className="w-3 h-3 text-emerald-600" />;
    };

    const renderRows = (items: Transaction[]) => (
        items.map((t) => (
            <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">
                    {(() => {
                        const index = filteredAndSortedTransactions.findIndex(item => item.id === t.id);
                        const total = filteredAndSortedTransactions.length;
                        // If sorting by Date Desc (Default), show N, N-1, N-2... (Chronological ID)
                        // Otherwise (Amount, Category, or Date Asc), show 1, 2, 3... (Rank/Order)
                        if (sortConfig.key === 'date' && sortConfig.direction === 'desc') {
                            return total - index;
                        }
                        return index + 1;
                    })()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {t.tags || t.category}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                    {(() => {
                        const color = stringToColor(t.category);
                        const Icon = getCategoryIcon(t.category);
                        return (
                            <span className={cn(
                                "flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium w-fit",
                                color.bg,
                                color.text
                            )}>
                                <Icon className="w-3.5 h-3.5" />
                                {t.category}
                            </span>
                        );
                    })()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{t.account}</td>
                <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={t.note}>
                    {t.note}
                    {!t.note && sortConfig.key !== 'date' && (
                        <span className="text-xs text-gray-400 ml-2">{new Date(t.date).toLocaleDateString()}</span>
                    )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex flex-col items-end gap-0.5">
                        <span className={`text-sm font-medium ${t.amount > 0 ? 'text-emerald-600' : 'text-gray-900'}`}>
                            {t.amount > 0 ? '+' : ''}{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(t.amount)}
                        </span>
                        {t.originalAmount && t.originalCurrency && t.originalCurrency !== 'RUB' && (
                            <span className="text-xs text-gray-500">
                                {(() => {
                                    try {
                                        return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: t.originalCurrency }).format(t.originalAmount);
                                    } catch (e) {
                                        return `${t.originalAmount.toLocaleString('ru-RU')} ${t.originalCurrency}`;
                                    }
                                })()}
                            </span>
                        )}
                    </div>
                </td>
            </tr>
        ))
    );

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="text-lg font-semibold text-gray-800">Recent Transactions</h3>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full sm:w-64 transition-all"
                    />
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left w-12">#</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">Name</th>
                            <th
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                onClick={() => handleSort('category')}
                            >
                                <div className="flex items-center gap-1">
                                    Category
                                    <SortIcon columnKey="category" />
                                </div>
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                            <th
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                onClick={() => handleSort('date')}
                            >
                                <div className="flex items-center gap-1">
                                    Note / Date
                                    <SortIcon columnKey="date" />
                                </div>
                            </th>
                            <th
                                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                onClick={() => handleSort('amount')}
                            >
                                <div className="flex items-center justify-end gap-1">
                                    Amount
                                    <SortIcon columnKey="amount" />
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {groupedTransactions ? (
                            groupedTransactions.map(({ date, items }) => (
                                <React.Fragment key={date}>
                                    <tr className="bg-gray-50/50">
                                        <td colSpan={6} className="px-6 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider sticky top-0 backdrop-blur-sm">
                                            {date}
                                        </td>
                                    </tr>
                                    {renderRows(items)}
                                </React.Fragment>
                            ))
                        ) : (
                            renderRows(paginatedTransactions)
                        )}

                        {filteredAndSortedTransactions.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-gray-400 text-sm">
                                    No transactions found matching your search.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {paginatedTransactions.length < filteredAndSortedTransactions.length && (
                <div className="p-4 border-t border-gray-100 bg-gray-50/30 text-center">
                    <button
                        onClick={handleLoadMore}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
                    >
                        Load More
                        <ChevronDown className="w-4 h-4" />
                    </button>
                    <p className="text-xs text-gray-400 mt-2">
                        Showing {paginatedTransactions.length} of {filteredAndSortedTransactions.length} transactions
                    </p>
                </div>
            )}
        </div>
    );
};
