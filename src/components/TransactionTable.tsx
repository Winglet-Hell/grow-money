import React, { useState, useMemo } from 'react';
import { TableVirtuoso, Virtuoso } from 'react-virtuoso';
import type { Transaction } from '../types';
import { usePrivacy } from '../contexts/PrivacyContext';
import { cn, stringToColor, formatDate } from '../lib/utils';
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

type VirtualItem =
    | { type: 'header'; date: string; stats: { income: number; expense: number } }
    | { type: 'transaction'; data: Transaction; originalIndex: number };

export const TransactionTable: React.FC<TransactionTableProps> = ({ transactions }) => {
    const { isPrivacyMode } = usePrivacy();
    const [searchTerm, setSearchTerm] = useState('');
    const [visibleCount, setVisibleCount] = useState(20);
    const [loadStep, setLoadStep] = useState(20);
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

    // Apply pagination (slice the data)
    const paginatedTransactions = useMemo(() => {
        return filteredAndSortedTransactions.slice(0, visibleCount);
    }, [filteredAndSortedTransactions, visibleCount]);

    // Calculate stats for PAGINATED transactions
    const dailyStats = useMemo(() => {
        const stats: Record<string, { income: number; expense: number }> = {};
        if (sortConfig.key !== 'date') return stats;

        paginatedTransactions.forEach(t => {
            const dateKey = formatDate(t.date);
            if (!stats[dateKey]) {
                stats[dateKey] = { income: 0, expense: 0 };
            }
            if (t.amount > 0) {
                stats[dateKey].income += t.amount;
            } else {
                stats[dateKey].expense += t.amount;
            }
        });
        return stats;
    }, [paginatedTransactions, sortConfig.key]);

    // Flatten for virtualization
    const virtualItems = useMemo(() => {
        const items: VirtualItem[] = [];

        if (sortConfig.key !== 'date') {
            // No grouping
            items.push(...paginatedTransactions.map((t, i) => ({ type: 'transaction' as const, data: t, originalIndex: i })));
        } else {
            // Group by date, but strictly respecting the order of paginatedTransactions
            let lastDate = '';
            paginatedTransactions.forEach((t, i) => {
                const dateKey = formatDate(t.date);
                if (dateKey !== lastDate) {
                    items.push({
                        type: 'header',
                        date: dateKey,
                        stats: dailyStats[dateKey] || { income: 0, expense: 0 }
                    });
                    lastDate = dateKey;
                }
                items.push({ type: 'transaction', data: t, originalIndex: i });
            });
        }
        return items;
    }, [paginatedTransactions, sortConfig.key, dailyStats]);

    const handleLoadMore = () => {
        setVisibleCount(prev => prev + loadStep);
    };

    const formatCurrency = (amount: number) => {
        if (isPrivacyMode) return '••••••';
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            maximumFractionDigits: 0
        }).format(amount);
    };

    const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
        if (sortConfig.key !== columnKey) return <ArrowUpDown className="w-3 h-3 text-gray-300" />;
        return sortConfig.direction === 'asc'
            ? <ArrowUp className="w-3 h-3 text-emerald-600" />
            : <ArrowDown className="w-3 h-3 text-emerald-600" />;
    };

    const MobileCard = ({ transaction: t }: { transaction: Transaction }) => {
        const color = stringToColor(t.category);
        const Icon = getCategoryIcon(t.category);

        return (
            <div className="bg-white p-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg", color.bg, color.text)}>
                            <Icon className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="font-medium text-gray-900">{t.tags || t.category}</div>
                            <div className="text-xs text-gray-500">{formatDate(t.date)}</div>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className={`font-semibold ${t.amount > 0 ? 'text-emerald-600' : 'text-gray-900'}`}>
                            {t.amount > 0 ? '+' : ''}{formatCurrency(t.amount)}
                        </span>
                    </div>
                </div>

                <div className="flex justify-between items-center text-sm text-gray-500 pl-[3.25rem]">
                    <span className="truncate max-w-[150px]">{t.tags ? t.category : (t.note || 'No description')}</span>
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded-full">{t.account}</span>
                </div>
                {t.originalAmount && t.originalCurrency && t.originalCurrency !== 'RUB' && (
                    <div className="text-right text-xs text-gray-400 mt-1">
                        {(() => {
                            if (isPrivacyMode) return '••••••';
                            try {
                                return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: t.originalCurrency }).format(t.originalAmount);
                            } catch (e) {
                                return `${t.originalAmount.toLocaleString('ru-RU')} ${t.originalCurrency}`;
                            }
                        })()}
                    </div>
                )}
            </div>
        );
    };

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

            {filteredAndSortedTransactions.length === 0 ? (
                <div className="p-12 text-center text-gray-400 text-sm">
                    No transactions found matching your search.
                </div>
            ) : (
                <>
                    {/* Desktop Table View */}
                    <div className="hidden md:block">
                        <TableVirtuoso
                            useWindowScroll
                            data={virtualItems}
                            components={{
                                Table: (props) => <table {...props} className="w-full border-collapse" />,
                                TableHead: React.forwardRef((props, ref) => <thead {...props} ref={ref} className="bg-gray-50" />),
                                TableRow: (props) => <tr {...props} className="hover:bg-gray-50 transition-colors" />
                            }}
                            fixedHeaderContent={() => (
                                <tr>
                                    <th className="px-6 py-3 text-left w-12 text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">#</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3 bg-gray-50">Name</th>
                                    <th
                                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none bg-gray-50"
                                        onClick={() => handleSort('category')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Category
                                            <SortIcon columnKey="category" />
                                        </div>
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Account</th>
                                    <th
                                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none bg-gray-50"
                                        onClick={() => handleSort('date')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Note / Date
                                            <SortIcon columnKey="date" />
                                        </div>
                                    </th>
                                    <th
                                        className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none bg-gray-50"
                                        onClick={() => handleSort('amount')}
                                    >
                                        <div className="flex items-center justify-end gap-1">
                                            Amount
                                            <SortIcon columnKey="amount" />
                                        </div>
                                    </th>
                                </tr>
                            )}
                            itemContent={(_index, item) => {
                                if (item.type === 'header') {
                                    return (
                                        <>
                                            <td colSpan={6} className="px-6 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/90 backdrop-blur-sm sticky top-0 z-10 border-t border-b border-gray-100">
                                                <div className="flex items-center justify-between">
                                                    <span>{item.date}</span>
                                                    <div className="flex items-center gap-4">
                                                        {item.stats.income > 0 && (
                                                            <span className="text-emerald-600 font-medium normal-case">
                                                                +{formatCurrency(item.stats.income)}
                                                            </span>
                                                        )}
                                                        {item.stats.expense < 0 && (
                                                            <span className="text-gray-500 font-medium normal-case">
                                                                {formatCurrency(item.stats.expense)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        </>
                                    );
                                }

                                const t = item.data;
                                return (
                                    <>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">
                                            {(() => {
                                                const total = filteredAndSortedTransactions.length;
                                                const displayIndex = (sortConfig.key === 'date' && sortConfig.direction === 'desc')
                                                    ? total - item.originalIndex
                                                    : item.originalIndex + 1;
                                                return displayIndex;
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
                                                <span className="text-xs text-gray-400 ml-2">{formatDate(t.date)}</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <div className="flex flex-col items-end gap-0.5">
                                                <span className={`text-sm font-medium ${t.amount > 0 ? 'text-emerald-600' : 'text-gray-900'}`}>
                                                    {t.amount > 0 ? '+' : ''}{formatCurrency(t.amount)}
                                                </span>
                                                {t.originalAmount && t.originalCurrency && t.originalCurrency !== 'RUB' && (
                                                    <span className="text-xs text-gray-500">
                                                        {(() => {
                                                            if (isPrivacyMode) return '••••••';
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
                                    </>
                                );
                            }}
                        />
                    </div>

                    {/* Mobile List View */}
                    <div className="md:hidden">
                        <Virtuoso
                            useWindowScroll
                            data={virtualItems}
                            itemContent={(_index, item) => {
                                if (item.type === 'header') {
                                    return (
                                        <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider flex justify-between items-center sticky top-0 z-10 border-b border-gray-100">
                                            <span>{item.date}</span>
                                            <div className="flex gap-2">
                                                {item.stats.income > 0 && <span className="text-emerald-600">+{formatCurrency(item.stats.income)}</span>}
                                                {item.stats.expense < 0 && <span className="text-gray-500">{formatCurrency(item.stats.expense)}</span>}
                                            </div>
                                        </div>
                                    );
                                }
                                return <MobileCard transaction={item.data} />;
                            }}
                        />
                    </div>
                </>
            )}

            {/* Pagination Controls */}
            {paginatedTransactions.length < filteredAndSortedTransactions.length && (
                <div className="p-4 border-t border-gray-100 bg-gray-50/30 text-center flex flex-col sm:flex-row items-center justify-center gap-4">
                    <button
                        onClick={handleLoadMore}
                        className="inline-flex items-center gap-2 px-6 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm w-full sm:w-auto justify-center"
                    >
                        Load {loadStep} More
                        <ChevronDown className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>Step size:</span>
                        <select
                            value={loadStep}
                            onChange={(e) => setLoadStep(Number(e.target.value))}
                            className="bg-white border border-gray-200 rounded-lg px-2 py-1 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        >
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                            <option value={500}>500</option>
                        </select>
                    </div>

                    <p className="text-xs text-gray-400">
                        Showing {paginatedTransactions.length} of {filteredAndSortedTransactions.length}
                    </p>
                </div>
            )}
        </div>
    );
};
