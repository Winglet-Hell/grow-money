import React, { useState, useMemo } from 'react';
import { TableVirtuoso, Virtuoso } from 'react-virtuoso';
import type { Transaction } from '../types';
import { usePrivacy } from '../contexts/PrivacyContext';
import { useUserSettings } from '../hooks/useUserSettings';
import { useAccounts } from '../hooks/useAccounts';
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
    | { type: 'header'; date: string; stats: Record<string, { income: number; expense: number }> }
    | { type: 'transaction'; data: Transaction; originalIndex: number };

export const TransactionTable: React.FC<TransactionTableProps> = ({ transactions }) => {
    const { isPrivacyMode } = usePrivacy();
    const { settings: { preferences } } = useUserSettings();
    const { accounts } = useAccounts(transactions);
    const [searchTerm, setSearchTerm] = useState('');
    const [visibleCount, setVisibleCount] = useState(20);
    const [loadStep, setLoadStep] = useState(20);
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'date', direction: 'desc' });

    // Preferences defaults
    const showCategory = preferences?.tableShowCategory !== false;
    const showAccount = preferences?.tableShowAccount !== false;
    const showNotes = preferences?.tableShowNotes !== false;
    const isCompact = preferences?.tableCompactMode === true;
    const py = isCompact ? 'py-2' : 'py-4';

    const getAccountCurrency = (accountName: string) => {
        const account = accounts.find(a => a.name === accountName);
        return account?.currency || 'RUB';
    };

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
                (t.tags && (
                    (Array.isArray(t.tags) && t.tags.join(' ').toLowerCase().includes(lowerTerm)) ||
                    (typeof t.tags === 'string' && (t.tags as any).toLowerCase().includes(lowerTerm))
                ))
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

    // Calculate stats for PAGINATED transactions - always in RUB
    const dailyStats = useMemo(() => {
        const stats: Record<string, Record<string, { income: number; expense: number }>> = {};
        if (sortConfig.key !== 'date') return stats;

        paginatedTransactions.forEach(t => {
            const dateKey = formatDate(t.date);
            const currency = 'RUB'; // t.amount is always in RUB

            if (!stats[dateKey]) {
                stats[dateKey] = {};
            }
            if (!stats[dateKey][currency]) {
                stats[dateKey][currency] = { income: 0, expense: 0 };
            }

            if (t.amount > 0) {
                stats[dateKey][currency].income += t.amount;
            } else {
                stats[dateKey][currency].expense += t.amount;
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
                        stats: dailyStats[dateKey] || {}
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

    const formatCurrency = (amount: number, currency: string = 'RUB') => {
        if (isPrivacyMode) return '••••••';

        // 1. Handle Crypto / Custom Currencies manually
        if (['USDT', 'BTC', 'ETH'].includes(currency)) {
            let decimals = 2;
            if (currency === 'BTC' || currency === 'ETH') decimals = 6;

            const value = new Intl.NumberFormat('ru-RU', {
                style: 'decimal',
                maximumFractionDigits: decimals,
                minimumFractionDigits: 0
            }).format(amount);

            return `${value} ${currency}`;
        }

        // 2. Handle Standard Fiat Currencies via Intl
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: currency,
            maximumFractionDigits: 0,
            minimumFractionDigits: 0
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

        // t.amount is always in RUB (converted)
        // Show original currency if present
        const showOriginalCurrency = t.originalAmount && t.originalCurrency;

        return (
            <div className="bg-white p-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg", color.bg, color.text)}>
                            <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <div className="font-medium text-gray-900">{t.tags || t.note || t.category}</div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs bg-gray-100 px-2 py-1 rounded-full text-gray-600">
                                    {t.tags ? (t.note || t.category) : (t.note ? t.category : 'No category')}
                                </span>
                                <span className="text-xs text-gray-400">• {t.account}</span>
                            </div>
                        </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                        {/* Primary amount - RUB (converted) - t.amount is always in RUB */}
                        <div className={`font-semibold text-lg ${t.amount > 0 ? 'text-emerald-600' : 'text-gray-900'}`}>
                            {t.amount > 0 ? '+' : ''}{formatCurrency(t.amount, 'RUB')}
                        </div>
                        {/* Secondary amount - Original currency */}
                        {showOriginalCurrency && t.originalAmount && t.originalCurrency && (
                            <div className="text-sm text-gray-500 mt-0.5">
                                {(() => {
                                    if (isPrivacyMode) return '••••••';
                                    return formatCurrency(t.originalAmount, t.originalCurrency);
                                })()}
                            </div>
                        )}
                    </div>
                </div>
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
                                    {showCategory && (
                                        <th
                                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none bg-gray-50"
                                            onClick={() => handleSort('category')}
                                        >
                                            <div className="flex items-center gap-1">
                                                Category
                                                <SortIcon columnKey="category" />
                                            </div>
                                        </th>
                                    )}
                                    {showAccount && (
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 w-[140px] min-w-[140px]">Account</th>
                                    )}
                                    {showNotes && (
                                        <th
                                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none bg-gray-50 w-[180px] min-w-[180px]"
                                            onClick={() => handleSort('date')}
                                        >
                                            <div className="flex items-center gap-1">
                                                Note / Date
                                                <SortIcon columnKey="date" />
                                            </div>
                                        </th>
                                    )}
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
                                            <td colSpan={10} className="px-6 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/90 backdrop-blur-sm sticky top-0 z-10 border-t border-b border-gray-100">
                                                <div className="flex items-center justify-between">
                                                    <span>{item.date}</span>
                                                    <div className="flex flex-col items-end gap-1">
                                                        {Object.entries(item.stats).map(([currency, stat]) => (
                                                            <div key={currency} className="flex items-center gap-3">
                                                                {stat.income > 0 && (
                                                                    <span className="text-emerald-600 font-medium normal-case">
                                                                        +{formatCurrency(stat.income, currency)}
                                                                    </span>
                                                                )}
                                                                {stat.expense < 0 && (
                                                                    <span className="text-gray-500 font-medium normal-case">
                                                                        {formatCurrency(stat.expense, currency)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </td>
                                        </>
                                    );
                                }

                                const t = item.data;
                                const currency = t.currency || getAccountCurrency(t.account);

                                return (
                                    <>
                                        <td className={`px-6 ${py} whitespace-nowrap text-sm text-gray-400 font-mono`}>
                                            {(() => {
                                                const total = filteredAndSortedTransactions.length;
                                                const displayIndex = (sortConfig.key === 'date' && sortConfig.direction === 'desc')
                                                    ? total - item.originalIndex
                                                    : item.originalIndex + 1;
                                                return displayIndex;
                                            })()}
                                        </td>
                                        <td className={`px-6 ${py} whitespace-nowrap text-sm font-medium text-gray-900`}>
                                            {t.tags || t.note || t.category}
                                        </td>
                                        {showCategory && (
                                            <td className={`px-6 ${py} whitespace-nowrap`}>
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
                                        )}
                                        {showAccount && (
                                            <td className={`px-6 ${py} whitespace-nowrap text-sm text-gray-500 w-[140px] min-w-[140px] max-w-[140px] truncate`}>{t.account}</td>
                                        )}
                                        {showNotes && (
                                            <td className={`px-6 ${py} text-sm text-gray-500 w-[180px] min-w-[180px] max-w-[180px] truncate`} title={t.note}>
                                                {t.note}
                                                {!t.note && sortConfig.key !== 'date' && (
                                                    <span className="text-xs text-gray-400 ml-2">{formatDate(t.date)}</span>
                                                )}
                                            </td>
                                        )}
                                        <td className={`px-6 ${py} whitespace-nowrap text-right`}>
                                            <div className="flex flex-col items-end gap-0.5">
                                                <span className={`text-sm font-medium ${t.amount > 0 ? 'text-emerald-600' : 'text-gray-900'}`}>
                                                    {t.amount > 0 ? '+' : ''}{formatCurrency(t.amount, currency)}
                                                </span>
                                                {!!t.originalAmount && !!t.originalCurrency && t.originalCurrency !== 'RUB' && (
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
                                            <div className="flex flex-col items-end gap-1">
                                                {Object.entries(item.stats).map(([currency, stat]) => (
                                                    <div key={currency} className="flex gap-2">
                                                        {stat.income > 0 && <span className="text-emerald-600">+{formatCurrency(stat.income, currency)}</span>}
                                                        {stat.expense < 0 && <span className="text-gray-500">{formatCurrency(stat.expense, currency)}</span>}
                                                    </div>
                                                ))}
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
                        <div className="relative flex items-center group">
                            <select
                                value={loadStep}
                                onChange={(e) => setLoadStep(Number(e.target.value))}
                                className="bg-white border border-gray-200 rounded-lg pl-2 pr-8 py-1 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 appearance-none cursor-pointer hover:border-gray-300 transition-all"
                                style={{ WebkitTapHighlightColor: 'transparent' }}
                            >
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                                <option value={500}>500</option>
                            </select>
                            <ChevronDown className="absolute right-2.5 w-3.5 h-3.5 text-gray-400 group-hover:text-emerald-500 pointer-events-none transition-colors" />
                        </div>
                    </div>

                    <p className="text-xs text-gray-400">
                        Showing {paginatedTransactions.length} of {filteredAndSortedTransactions.length}
                    </p>
                </div>
            )}
        </div>
    );
};
