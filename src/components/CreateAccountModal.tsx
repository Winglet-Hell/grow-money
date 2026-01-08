import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Wallet, Bitcoin, Landmark, Banknote, CreditCard, ChevronDown } from 'lucide-react';
import type { Account } from '../types';

interface CreateAccountModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (name: string, currency: string, balance: number, type: Account['type']) => Promise<void>;
}

const SUPPORTED_CURRENCIES = ['THB', 'USD', 'EUR', 'RUB', 'HKD', 'MYR', 'GEL', 'AED', 'USDT', 'BTC', 'ETH', 'GBP'];
const ACCOUNT_TYPES: { id: Account['type']; label: string; icon: React.ReactNode }[] = [
    { id: 'cash', label: 'Cash', icon: <Banknote className="w-4 h-4" /> },
    { id: 'bank', label: 'Bank Account', icon: <Landmark className="w-4 h-4" /> },
    { id: 'card', label: 'Credit/Debit Card', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'wallet', label: 'Digital Wallet', icon: <Wallet className="w-4 h-4" /> },
    { id: 'crypto', label: 'Crypto', icon: <Bitcoin className="w-4 h-4" /> },
];

export const CreateAccountModal: React.FC<CreateAccountModalProps> = ({
    isOpen,
    onClose,
    onSave
}) => {
    const [name, setName] = useState('');
    const [currency, setCurrency] = useState('THB');
    const [balance, setBalance] = useState('');
    const [type, setType] = useState<Account['type']>('cash');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
            setName('');
            setCurrency('THB');
            setBalance('');
            setType('cash');
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!name.trim()) return;

        setIsSubmitting(true);
        const val = parseFloat(balance.replace(/,/g, '.'));
        const finalBalance = isNaN(val) ? 0 : val;

        await onSave(name, currency, finalBalance, type);
        setIsSubmitting(false);
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
                        Add New Account
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
                            placeholder="e.g. Secret Stash"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoFocus
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
                                Initial Balance
                            </label>
                            <input
                                type="number"
                                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 sm:text-sm py-2.5 px-3 border"
                                placeholder="0.00"
                                value={balance}
                                onChange={(e) => setBalance(e.target.value)}
                            />
                        </div>
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
                        {isSubmitting ? 'Creating...' : 'Create Account'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
