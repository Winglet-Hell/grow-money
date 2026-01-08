import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Wallet, Bitcoin, Landmark, Banknote, CreditCard, Calendar, ChevronDown } from 'lucide-react';
import type { Transaction, Account } from '../types';
import { updateAccount } from '../lib/accountUtils';
import { db } from '../lib/db';

interface EditAccountModalProps {
    isOpen: boolean;
    onClose: () => void;
    account: { id: string; name: string; currency: string; balance: number; type: string; balance_date?: string; balance_checkpoint_tx_id?: string };
    onSave: () => void;
}

const SUPPORTED_CURRENCIES = ['THB', 'USD', 'EUR', 'RUB', 'HKD', 'MYR', 'GEL', 'AED', 'USDT', 'BTC', 'ETH', 'GBP'];
const ACCOUNT_TYPES: { id: Account['type']; label: string; icon: React.ReactNode }[] = [
    { id: 'cash', label: 'Cash', icon: <Banknote className="w-4 h-4" /> },
    { id: 'bank', label: 'Bank Account', icon: <Landmark className="w-4 h-4" /> },
    { id: 'card', label: 'Credit/Debit Card', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'wallet', label: 'Digital Wallet', icon: <Wallet className="w-4 h-4" /> },
    { id: 'crypto', label: 'Crypto', icon: <Bitcoin className="w-4 h-4" /> },
];

export const EditAccountModal: React.FC<EditAccountModalProps> = ({
    isOpen,
    onClose,
    account,
    onSave
}) => {
    const [name, setName] = useState('');
    const [currency, setCurrency] = useState('THB');
    const [balance, setBalance] = useState('');
    const [type, setType] = useState<Account['type']>('cash');
    const [balanceDate, setBalanceDate] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [balanceCheckpointTxId, setBalanceCheckpointTxId] = useState<string | undefined>(undefined);
    const [potentialCheckpointTxs, setPotentialCheckpointTxs] = useState<Transaction[]>([]);

    useEffect(() => {
        if (isOpen && account) {
            document.body.style.overflow = 'hidden';
            setName(account.name);
            setCurrency(account.currency);
            setBalance(account.balance.toString());
            setType(account.type as Account['type']);

            // Correctly convert stored UTC/ISO date to LOCAL YYYY-MM-DD for the input
            // ignoring the 'T' split which naively takes UTC day
            let initialDate = new Date().toISOString().split('T')[0];
            if (account.balance_date) {
                const d = new Date(account.balance_date);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                initialDate = `${year}-${month}-${day}`;
            }
            setBalanceDate(initialDate);

            setBalanceCheckpointTxId(account.balance_checkpoint_tx_id);
            if (account.balance_date) {
                // Fetch context
                fetchRecentTransactions(account.name);
            }
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, account]);

    // Fetch recent transactions for this account (regardless of date input, to ensure user sees something)
    useEffect(() => {
        if (account?.name) {
            fetchRecentTransactions(account.name);
        }
    }, [account]);

    const fetchRecentTransactions = async (accountName: string) => {
        if (!accountName) return;

        try {
            // Fetch ALL transactions for this account to find the most recent ones
            // We can't easily rely on limit() with sort in Dexie without a compound index, 
            // but filtering in memory for a single account is usually fast enough for personal finance apps.
            // RELAXED QUERY: Fetch all and filter in memory to handle case/whitespace mismatch
            // This ensures consistency with useAccounts.ts
            const normalize = (str: string) => (str || '').trim().toLowerCase();
            const target = normalize(accountName);

            const rawAll = await db.transactions.toArray();

            const allTxs = rawAll.filter(t => {
                const isOutgoing = normalize(t.account) === target;
                const isIncoming = t.type === 'transfer' && normalize(t.category) === target;
                return isOutgoing || isIncoming;
            });

            console.log(`[EditAccountModal] Found ${allTxs.length} transactions for ${accountName} (Target: "${target}")`);
            if (allTxs.length === 0) {
                console.log('[EditAccountModal] DEBUG: First 5 raw transactions:', rawAll.slice(0, 5));
            }

            // Sort by Date Descending, then Index Descending (to show newest first)
            // Safety check for index
            allTxs.sort((a, b) => {
                if (a.date > b.date) return -1;
                // Same date: use index (fall back to 0 if missing)
                // We want NEWEST FIRST (Index 0).
                return (a.index || 0) - (b.index || 0);
            });

            // Take top 50 to give context
            setPotentialCheckpointTxs(allTxs.slice(0, 50));
        } catch (e) {
            console.error('Error fetching transactions for checkpoint:', e);
        }
    };

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!name.trim()) return;

        setIsSubmitting(true);
        const val = parseFloat(balance.replace(/,/g, '.'));
        const finalBalance = isNaN(val) ? 0 : val;

        await updateAccount(account.id, {
            name,
            currency,
            balance: finalBalance,
            type,
            // Force Noon UTC to avoid timezone shifts (e.g. 00:00 Local -> Previous Day UTC)
            balance_date: balanceDate ? `${balanceDate}T12:00:00.000Z` : undefined,
            balance_checkpoint_tx_id: balanceCheckpointTxId
        });

        // 2. Critical: Propagate Name Change to Transactions in Dexie
        // If the account name changed, we must update all local transactions to point to the new name
        // otherwise they will be "lost" to the view.
        if (name !== account.name) {
            console.log(`[EditAccountModal] Renaming transactions from "${account.name}" to "${name}"`);
            await db.transactions
                .where('account')
                .equals(account.name)
                .modify({ account: name });
        }

        setIsSubmitting(false);
        onSave();
        onClose();
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            ></div>

            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-2xl">
                    <h3 className="text-lg font-semibold text-gray-900">
                        Edit Account
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Account Name
                        </label>
                        <input
                            type="text"
                            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 sm:text-sm py-2.5 px-3 border"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    {/* Type */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Account Type
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {ACCOUNT_TYPES.map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setType(t.id)}
                                    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-all ${type === t.id
                                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-1 ring-emerald-500'
                                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    {t.icon}
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Currency & Balance */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Currency
                            </label>
                            <div className="relative flex items-center group">
                                <select
                                    className="block w-full rounded-lg border-gray-300 shadow-sm focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 sm:text-sm py-2.5 pl-3 pr-10 border appearance-none cursor-pointer bg-white transition-all hover:border-emerald-300 outline-none focus:outline-none"
                                    style={{ WebkitTapHighlightColor: 'transparent' }}
                                    value={currency}
                                    onChange={(e) => setCurrency(e.target.value)}
                                >
                                    {SUPPORTED_CURRENCIES.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                    <option value="CUSTOM">Other...</option>
                                </select>
                                <ChevronDown className="absolute right-3 w-4 h-4 text-gray-400 group-hover:text-emerald-500 pointer-events-none transition-colors" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Balance
                            </label>
                            <input
                                type="number"
                                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 sm:text-sm py-2.5 px-3 border"
                                value={balance}
                                onChange={(e) => setBalance(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Checkpoint Date */}
                    <div className="pt-2 border-t border-gray-100">
                        <label className="block text-sm font-medium text-gray-900 mb-1 flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-emerald-600" />
                            Balance Checkpoint Date
                        </label>
                        <p className="text-xs text-gray-500 mb-2">
                            Transactions before this date will be ignored.
                        </p>
                        <input
                            type="date"
                            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 sm:text-sm py-2.5 px-3 border mb-3"
                            value={balanceDate}
                            onChange={(e) => {
                                setBalanceDate(e.target.value);
                                setBalanceCheckpointTxId(undefined); // Clear checkpoint when date changes
                            }}
                        />

                        {balanceDate && (
                            <div className="mt-3 space-y-2">
                                <label className="block text-xs font-medium text-gray-500">
                                    Select "Last Included Transaction" (List shows last 50 transactions)
                                </label>
                                <div className="max-h-40 overflow-y-auto border rounded-lg divide-y bg-gray-50">
                                    {potentialCheckpointTxs.map(tx => (
                                        <div
                                            key={tx.id}
                                            onClick={() => {
                                                if (tx.id === balanceCheckpointTxId) {
                                                    setBalanceCheckpointTxId(undefined);
                                                } else {
                                                    setBalanceCheckpointTxId(tx.id);
                                                    setBalanceDate(tx.date); // Auto-sync date
                                                }
                                            }}
                                            className={`p-2 text-xs cursor-pointer hover:bg-emerald-50 transition-colors flex justify-between gap-2 ${tx.id === balanceCheckpointTxId ? 'bg-emerald-100 border-l-4 border-emerald-500' : ''}`}
                                        >
                                            <span className="text-gray-400 w-20 shrink-0">{tx.date}</span>
                                            <span className="truncate flex-1 font-medium text-gray-700">{tx.category} <span className="text-gray-400 font-normal">{tx.note ? `(${tx.note})` : ''}</span></span>
                                            <span className={tx.type === 'income' ? 'text-green-600' : 'text-red-600'}>
                                                {tx.amount > 0 ? '+' : ''}{tx.amount}
                                            </span>
                                        </div>
                                    ))}
                                    {potentialCheckpointTxs.length === 0 && (
                                        <div className="p-2 text-[10px] text-gray-400 text-center italic">
                                            No transactions found for this date.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!name.trim() || isSubmitting}
                        className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
