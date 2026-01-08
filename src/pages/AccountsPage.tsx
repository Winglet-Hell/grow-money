import { useState, useMemo } from 'react';
import { Wallet, Bitcoin, Landmark, Banknote, CreditCard, TrendingUp, DollarSign, Wifi, WifiOff, Plus, Pencil, Eye, EyeOff } from 'lucide-react';
import type { Transaction, Account } from '../types';
import { useAccounts, type AccountStatus } from '../hooks/useAccounts';
import { usePrivacy } from '../contexts/PrivacyContext';
import { CreateAccountModal } from '../components/CreateAccountModal';
import { EditAccountModal } from '../components/EditAccountModal';
import { createManualAccount } from '../lib/accountUtils';

interface AccountsPageProps {
    transactions: Transaction[];
    userId?: string;
}

export function AccountsPage({ transactions, userId }: AccountsPageProps) {
    const { isPrivacyMode } = usePrivacy();
    const { accounts: accountsStatus, totalNetWorth, rates, isLoadingRates, isLiveRates, refreshAccounts } = useAccounts(transactions);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingAccount, setEditingAccount] = useState<AccountStatus | null>(null);
    const [showHidden, setShowHidden] = useState(false);

    const groups = useMemo(() => {
        // Filter out zero-balance accounts unless 'showHidden' is true
        const activeAccounts = accountsStatus.filter(a => showHidden || Math.abs(a.current) > 0.01);

        return {
            fiat: activeAccounts.filter(a => ['bank', 'cash', 'wallet', 'card'].includes(a.type) && a.currency !== 'USDT'),
            crypto: activeAccounts.filter(a => a.type === 'crypto' || a.currency === 'USDT'),
            fiatOnly: activeAccounts.filter(a => !(['crypto'].includes(a.type) || a.currency === 'USDT'))
        };
    }, [accountsStatus, showHidden]);

    const formatCurrency = (amount: number, currency: string) => {
        if (isPrivacyMode) return '••••••';
        try {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: currency,
                maximumFractionDigits: currency === 'BTC' ? 8 : 0,
            }).format(amount);
        } catch (e) {
            return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: currency === 'BTC' ? 8 : 2 }).format(amount)} ${currency}`;
        }
    };

    const getIcon = (type: string) => {
        const props = { className: "w-10 h-10", strokeWidth: 1.5 };
        switch (type) {
            case 'wallet': return <Wallet {...props} />;
            case 'crypto': return <Bitcoin {...props} />;
            case 'bank': return <Landmark {...props} />;
            case 'cash': return <Banknote {...props} />;
            case 'card': return <CreditCard {...props} />;
            default: return <DollarSign {...props} />;
        }
    };

    const handleCreateAccount = async (name: string, currency: string, balance: number, type: Account['type']) => {
        if (userId) {
            await createManualAccount(userId, name, currency, balance, type);
            // Refresh accounts list
            if (refreshAccounts) refreshAccounts();
        }
    };

    const handleEditSave = () => {
        if (refreshAccounts) refreshAccounts();
    };

    const AccountCard = ({ account }: { account: AccountStatus }) => {
        const rate = rates[account.currency] || 1;

        // Only allow editing if it is a DB account (has a UUID-like ID, not a name-based ID)
        // Simple check: DB IDs are usually 36 chars (UUID). Inferred IDs are usually short names.
        // Or we can just allow editing anything that maps to a DB account. 
        // For now, let's assume we can edit if we have a userId context (meaning we are logged in).
        const canEdit = !!userId;

        return (
            <div className={`p-6 rounded-2xl border transition-all duration-300 group relative flex items-start justify-between ${Math.abs(account.current) < 0.01
                ? 'bg-gray-50 border-gray-100 opacity-60 hover:opacity-100'
                : 'bg-white border-gray-100 shadow-sm hover:shadow-md'
                }`}>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex-1">
                            <h3 className={`font-semibold truncate ${Math.abs(account.current) < 0.01 ? 'text-gray-500' : 'text-gray-900'
                                }`}>{account.name}</h3>
                            {account.currency !== 'RUB' && (
                                <div className="text-xs text-gray-400 font-medium mt-0.5">
                                    Rate: {rate.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="space-y-1">
                        <div className={`text-2xl font-bold ${account.current < 0 ? 'text-red-500' : Math.abs(account.current) < 0.01 ? 'text-gray-400' : 'text-gray-900'
                            }`}>
                            {formatCurrency(account.current, account.currency)}
                        </div>
                        <div className="text-sm text-gray-500 font-medium">
                            ≈ {formatCurrency(account.rubEquivalent, 'RUB')}
                        </div>
                    </div>
                </div>

                <div className="flex-shrink-0 ml-4 flex flex-col items-end justify-between self-stretch">
                    <div className={Math.abs(account.current) < 0.01 ? 'text-gray-300' : 'text-emerald-500'}>
                        {getIcon(account.type)}
                    </div>
                    {canEdit && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setEditingAccount(account);
                            }}
                            className="p-2 text-gray-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-full opacity-0 group-hover:opacity-100 transition-all mt-auto"
                            title="Edit Account"
                        >
                            <Pencil className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
            {/* Header / Net Worth */}
            <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-3xl p-6 sm:p-8 text-white shadow-lg overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>

                <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-1">
                        <h2 className="text-emerald-100/80 font-medium text-base sm:text-lg">Total Net Worth</h2>
                        <div className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
                            {isPrivacyMode ? '••••••' : formatCurrency(totalNetWorth, 'RUB')}
                        </div>
                        <div className="pt-2 flex items-center gap-2 text-emerald-100/70 text-xs sm:text-sm">
                            {isLoadingRates ? (
                                <TrendingUp className="w-4 h-4 animate-pulse" />
                            ) : isLiveRates ? (
                                <Wifi className="w-4 h-4" />
                            ) : (
                                <WifiOff className="w-4 h-4 text-emerald-300" />
                            )}
                            <span className="font-medium">
                                {isLoadingRates
                                    ? 'Updating rates...'
                                    : isLiveRates
                                        ? 'Live Market Rates'
                                        : 'Estimated Rates (Offline)'}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <button
                            onClick={() => setShowHidden(!showHidden)}
                            className="flex-1 md:flex-none justify-center bg-white/10 hover:bg-white/20 text-white backdrop-blur-md px-4 py-2.5 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2 border border-white/10 hover:border-white/20 active:scale-95"
                            title={showHidden ? "Hide zero balance accounts" : "Show zero balance accounts"}
                        >
                            {showHidden ? (
                                <>
                                    <EyeOff className="w-4 h-4" />
                                    <span>Hide Empty</span>
                                </>
                            ) : (
                                <>
                                    <Eye className="w-4 h-4" />
                                    <span>Show Empty</span>
                                </>
                            )}
                        </button>

                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="flex-1 md:flex-none justify-center bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg px-4 py-2.5 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2 border border-emerald-400/30 active:scale-95"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Add Account</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Fiat & Cash Section */}
            <section>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Banknote className="w-5 h-5 text-gray-500" />
                    Fiat & Cash
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {groups.fiatOnly.map(acc => (
                        <AccountCard key={acc.id} account={acc} />
                    ))}
                    {groups.fiatOnly.length === 0 && (
                        <p className="text-gray-500 italic col-span-full">No fiat accounts found.</p>
                    )}
                </div>
            </section>

            {/* Crypto & Investments Section */}
            <section>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Bitcoin className="w-5 h-5 text-gray-500" />
                    Crypto & Investments
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {groups.crypto.map(acc => (
                        <AccountCard key={acc.id} account={acc} />
                    ))}
                    {groups.crypto.length === 0 && (
                        <p className="text-gray-500 italic col-span-full">No crypto accounts found.</p>
                    )}
                </div>
            </section>

            <CreateAccountModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSave={handleCreateAccount}
            />

            {editingAccount && (
                <EditAccountModal
                    isOpen={!!editingAccount}
                    // Transform account status to simple object for modal
                    account={{
                        id: editingAccount.id,
                        name: editingAccount.name,
                        currency: editingAccount.currency,
                        // For editing, we probably want to edit INITIAL balance,
                        // but user might intuitively expect CURRENT balance edit if setting checkpoing.
                        // Since we are setting a Checkpoint, we are essentially saying "On this DATE, the balance IS X".
                        // So we should prefill with CURRENT balance to make it easy to just save checkpoints.
                        balance: editingAccount.current,
                        type: editingAccount.type,
                        balance_date: editingAccount.balance_date
                    }}
                    onClose={() => setEditingAccount(null)}
                    onSave={handleEditSave}
                />
            )}
        </div>
    );
}
