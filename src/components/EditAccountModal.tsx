import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Wallet, Bitcoin, Landmark, Banknote, CreditCard, Trash2, Merge } from 'lucide-react';
import type { Account } from '../types';
import { updateAccount, deleteAccount, mergeAccounts, isStoredAccountId } from '../lib/accountUtils';
import { db } from '../lib/db';
import { CurrencySelect } from './CurrencySelect';
import { ConfirmDialog } from './ConfirmDialog';

export interface MergeTarget { id: string; name: string; currency: string; balance: number }

interface EditAccountModalProps {
    isOpen: boolean;
    onClose: () => void;
    account: { id: string; name: string; currency: string; balance: number; type: string };
    onSave: () => void;
    // Other stored wallets this one could be folded into (same currency, filtered here).
    mergeTargets?: MergeTarget[];
    // Called after a merge or rename re-pointed local operations, so the app reloads them.
    onTransactionsChanged?: () => void;
}

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
    onSave,
    mergeTargets = [],
    onTransactionsChanged,
}) => {
    const [name, setName] = useState('');
    const [currency, setCurrency] = useState('THB');
    const [balance, setBalance] = useState('');
    const [type, setType] = useState<Account['type']>('cash');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [mergeTargetId, setMergeTargetId] = useState('');
    const [isMergeOpen, setIsMergeOpen] = useState(false);
    const [isMerging, setIsMerging] = useState(false);

    useEffect(() => {
        if (isOpen && account) {
            document.body.style.overflow = 'hidden';
            setName(account.name);
            setCurrency(account.currency);
            setBalance(account.balance.toString());
            setType(account.type as Account['type']);
            setMergeTargetId('');
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, account]);

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!name.trim()) return;

        setIsSubmitting(true);
        const val = parseFloat(balance.replace(/,/g, '.'));
        const finalBalance = isNaN(val) ? 0 : val;

        // Balance is manual — persist what the user typed, and stamp when, so the card
        // can say how fresh the number is.
        const balanceChanged = finalBalance !== account.balance;
        await updateAccount(account.id, {
            name,
            currency,
            balance: finalBalance,
            type,
            ...(balanceChanged || !isStoredAccountId(account.id) ? { balance_date: new Date().toISOString() } : {}),
        });

        // Keep local transactions pointing at the account if it was renamed, so analytics
        // (which reference accounts by name) stay consistent.
        if (name !== account.name) {
            await db.transactions
                .where('account')
                .equals(account.name)
                .modify({ account: name });
            await db.transactions
                .where('category')
                .equals(account.name)
                .and(t => t.type === 'transfer')
                .modify({ category: name });
            onTransactionsChanged?.();
        }

        setIsSubmitting(false);
        onSave();
        onClose();
    };

    // Merge: fold this wallet into another one of the same currency.
    const sameCurrencyTargets = mergeTargets.filter(t => t.id !== account.id && t.currency === account.currency && isStoredAccountId(t.id));
    const mergeTarget = sameCurrencyTargets.find(t => t.id === mergeTargetId);

    const handleMerge = async () => {
        if (!mergeTarget) return;
        setIsMerging(true);
        const result = await mergeAccounts(
            { id: account.id, name: account.name, currency: account.currency, balance: account.balance },
            mergeTarget
        );
        setIsMerging(false);
        if (!result.success) {
            console.error('Merge failed:', result.error);
            return;
        }
        setIsMergeOpen(false);
        onTransactionsChanged?.();
        onSave();
        onClose();
    };

    // Only rows that exist in the DB can be deleted; a discovered account (seen in
    // transactions but never saved) has nothing to remove yet.
    const canDelete = isStoredAccountId(account.id);

    const handleDelete = async () => {
        setIsDeleting(true);
        const { success } = await deleteAccount(account.id);
        setIsDeleting(false);
        if (!success) return;
        setIsDeleteOpen(false);
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
                            <CurrencySelect value={currency} onChange={setCurrency} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Current Balance
                            </label>
                            <input
                                type="number"
                                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 sm:text-sm py-2.5 px-3 border"
                                value={balance}
                                onChange={(e) => setBalance(e.target.value)}
                            />
                        </div>
                    </div>

                    <p className="text-xs text-gray-500">
                        Enter the actual balance of this wallet. It's set manually — imported
                        transactions won't change it.
                    </p>

                    {sameCurrencyTargets.length > 0 && (
                        <div className="pt-3 border-t border-gray-100">
                            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                                <Merge className="w-4 h-4 text-gray-400" />
                                Merge into another wallet
                            </label>
                            <div className="flex gap-2">
                                <select
                                    value={mergeTargetId}
                                    onChange={(e) => setMergeTargetId(e.target.value)}
                                    className="flex-1 min-w-0 rounded-lg border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 sm:text-sm py-2 px-3 border bg-white"
                                >
                                    <option value="">Choose a {account.currency} wallet…</option>
                                    {sameCurrencyTargets.map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    disabled={!mergeTarget}
                                    onClick={() => setIsMergeOpen(true)}
                                    className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    Merge
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                For a wallet renamed in the source app: the balance moves over, imported operations
                                are re-pointed, and this wallet is removed.
                            </p>
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex items-center gap-3">
                    {canDelete && (
                        <button
                            type="button"
                            onClick={() => setIsDeleteOpen(true)}
                            className="p-2 -ml-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete account"
                            aria-label="Delete account"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                    <div className="flex-1" />
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

            <ConfirmDialog
                isOpen={isMergeOpen}
                title={mergeTarget ? `Merge "${account.name}" into "${mergeTarget.name}"?` : ''}
                description={mergeTarget
                    ? `${mergeTarget.name} will hold ${account.balance + mergeTarget.balance} ${account.currency} (${mergeTarget.balance} + ${account.balance}). Operations recorded under "${account.name}" will show as "${mergeTarget.name}", and "${account.name}" will be deleted.`
                    : ''}
                confirmLabel="Merge"
                isBusy={isMerging}
                onConfirm={handleMerge}
                onCancel={() => setIsMergeOpen(false)}
            />

            <ConfirmDialog
                isOpen={isDeleteOpen}
                title={`Delete "${account.name}"?`}
                description="The wallet and its balance are removed from your account. Imported transactions are not affected — if they still mention this account it will show up again with a zero balance."
                confirmLabel="Delete"
                tone="danger"
                isBusy={isDeleting}
                onConfirm={handleDelete}
                onCancel={() => setIsDeleteOpen(false)}
            />
        </div>,
        document.body
    );
};
