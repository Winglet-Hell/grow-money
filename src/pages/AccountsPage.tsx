import { useMemo, useState, useEffect } from 'react';
import { Wallet, Bitcoin, Landmark, Banknote, CreditCard, TrendingUp, DollarSign, Wifi, WifiOff } from 'lucide-react';
import type { Transaction } from '../types';

interface AccountConfig {
    id: string;
    name: string;
    currency: string;
    initial: number;
    type: 'wallet' | 'crypto' | 'bank' | 'cash' | 'card';
}

const INITIAL_BALANCES: AccountConfig[] = [
    { id: 'tm', name: 'TrueMoney', currency: 'THB', initial: 8934, type: 'wallet' },
    { id: 'usdt', name: 'USDT Bybit', currency: 'USDT', initial: 2294, type: 'crypto' },
    { id: 'rub', name: 'RUB', currency: 'RUB', initial: 1440000, type: 'bank' },
    { id: 'thb_wallet', name: 'THB Wallet', currency: 'THB', initial: 9016, type: 'cash' },
    { id: 'redot', name: 'RedotPay', currency: 'USDT', initial: 9.91, type: 'card' },
    // New accounts found from transactions
    { id: 'deep_pocket', name: 'Deep pocket', currency: 'THB', initial: 712, type: 'cash' }, // TODO: Confirm currency
    { id: 'thb_cash', name: 'THB Cash', currency: 'THB', initial: 0, type: 'cash' },
    { id: 'myr_wallet', name: 'MYR Wallet', currency: 'MYR', initial: 0, type: 'cash' },
    { id: 'hkd_wallet', name: 'HKD wallet', currency: 'HKD', initial: 0, type: 'cash' },
    { id: 'tagthai', name: 'TagThai', currency: 'THB', initial: 0, type: 'wallet' },
    { id: 'usd_cash', name: 'USD Cash', currency: 'USD', initial: 2400, type: 'cash' },
    { id: 'btc_wallet', name: 'Bitcoin Wallet', currency: 'BTC', initial: 0.14675181, type: 'crypto' },
];

const DEFAULT_RATES: Record<string, number> = {
    USDT: 98,
    USD: 98,
    THB: 2.8,
    RUB: 1,
    MYR: 23,
    HKD: 13,
    BTC: 9500000,
};


interface AccountsPageProps {
    transactions: Transaction[];
}

interface AccountStatus extends AccountConfig {
    current: number;
    rubEquivalent: number;
}

const ANCHOR_DATE = new Date('2026-01-06T00:00:00');


export function AccountsPage({ transactions }: AccountsPageProps) {
    const [rates, setRates] = useState<Record<string, number>>(DEFAULT_RATES);
    const [isLoadingRates, setIsLoadingRates] = useState(false);
    const [isLiveRates, setIsLiveRates] = useState(false);

    useEffect(() => {
        const fetchRates = async () => {
            setIsLoadingRates(true);
            try {
                // Fetch rates with base RUB. API returns how much 1 RUB is in other currencies.
                // e.g. USD: 0.01 (1 RUB = 0.01 USD) -> 1 USD = 1/0.01 = 100 RUB.
                const response = await fetch('https://latest.currency-api.pages.dev/v1/currencies/rub.json');
                const data = await response.json();

                if (data && data.rub) {
                    const newRates: Record<string, number> = { ...DEFAULT_RATES };
                    const apiRates = data.rub;

                    // Map API rates to our multiplier format (Values in RUB)
                    Object.keys(apiRates).forEach(currency => {
                        const code = currency.toUpperCase();
                        const rate = apiRates[currency];
                        if (rate > 0) {
                            newRates[code] = 1 / rate;
                        }
                    });

                    // Peg USDT to USD
                    if (newRates['USD']) {
                        newRates['USDT'] = newRates['USD'];
                    }

                    setRates(newRates);
                    setIsLiveRates(true);
                }
            } catch (error) {
                console.error('Failed to fetch rates:', error);
                setIsLiveRates(false);
            } finally {
                setIsLoadingRates(false);
            }
        };

        fetchRates();
    }, []);

    const accountsStatus = useMemo(() => {
        // Deep copy initial config
        const balances = INITIAL_BALANCES.map(acc => ({
            ...acc,
            current: acc.initial,
            rubEquivalent: 0
        }));

        const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '');

        transactions.forEach(t => {
            if (new Date(t.date) <= ANCHOR_DATE) return;

            let idx = balances.findIndex(b => normalize(b.name) === normalize(t.account));

            // Dynamic Discovery: If account doesn't exist, create it.
            if (idx === -1) {
                const newAccount: AccountStatus = {
                    id: normalize(t.account),
                    name: t.account,
                    currency: 'THB', // Default to THB or try to infer?
                    initial: 0,
                    type: 'cash', // Default type
                    current: 0,
                    rubEquivalent: 0
                };

                // Try to infer currency/type from name
                if (t.account.toLowerCase().includes('usd')) { newAccount.currency = 'USD'; }
                if (t.account.toLowerCase().includes('eur')) { newAccount.currency = 'EUR'; }
                if (t.account.toLowerCase().includes('btc') || t.account.toLowerCase().includes('bitcoin')) {
                    newAccount.currency = 'BTC';
                    newAccount.type = 'crypto';
                }

                balances.push(newAccount);
                idx = balances.length - 1;
            }

            if (idx !== -1) {
                if (t.type === 'income') {
                    balances[idx].current += t.amount;
                } else if (t.type === 'expense') {
                    if (t.amount > 0) {
                        balances[idx].current -= t.amount;
                    } else {
                        balances[idx].current += t.amount;
                    }
                } else if (t.type === 'transfer') {
                    // Source Account (Debit) - Typically "Amount in Source Currency"
                    // In transfer sheets, amounts are usually positive.
                    if (t.amount > 0) {
                        balances[idx].current -= t.amount;
                    } else {
                        balances[idx].current += t.amount;
                    }

                    // Destination Account (Credit) - Name is in 'category' (mapped from 'Входящий счет')
                    const destName = t.category;
                    if (destName && destName !== 'Uncategorized') {
                        let destIdx = balances.findIndex(b => normalize(b.name) === normalize(destName));

                        if (destIdx === -1) {
                            // Create Destination Account
                            const newDest: AccountStatus = {
                                id: normalize(destName),
                                name: destName,
                                currency: t.originalCurrency || balances[idx].currency || 'THB',
                                initial: 0,
                                type: 'cash',
                                current: 0,
                                rubEquivalent: 0
                            };
                            // Try hints
                            if (destName.toLowerCase().includes('usd')) newDest.currency = 'USD';
                            if (destName.toLowerCase().includes('rub')) newDest.currency = 'RUB';
                            if (destName.toLowerCase().includes('btc')) { newDest.currency = 'BTC'; newDest.type = 'crypto'; }
                            // Also trust explicit currency from file
                            if (t.originalCurrency) newDest.currency = t.originalCurrency;

                            balances.push(newDest);
                            destIdx = balances.length - 1;
                        }

                        // Add to Destination
                        // Use originalAmount (Destination Amount) if available, else Source Amount
                        const creditAmount = (t.originalAmount && t.originalAmount > 0)
                            ? t.originalAmount
                            : t.amount;

                        if (creditAmount > 0) {
                            balances[destIdx].current += creditAmount;
                        } else {
                            balances[destIdx].current -= creditAmount;
                        }
                    }
                }
            }
        });

        // Calculate RUB equivalents using dynamic rates
        balances.forEach(b => {
            // If currency not found in rates, fallback to 1 (or handle error)
            const rate = rates[b.currency] || DEFAULT_RATES[b.currency] || 1;
            b.rubEquivalent = b.current * rate;
        });

        return balances;
    }, [transactions, rates]); // depend on rates now

    const totalNetWorth = useMemo(() => {
        return accountsStatus.reduce((acc, curr) => acc + curr.rubEquivalent, 0);
    }, [accountsStatus]);

    const groups = useMemo(() => {
        const activeAccounts = accountsStatus.filter(a => Math.abs(a.current) > 0.01);

        return {
            fiat: activeAccounts.filter(a => ['bank', 'cash', 'wallet', 'card'].includes(a.type) && a.currency !== 'USDT'),
            crypto: activeAccounts.filter(a => a.type === 'crypto' || a.currency === 'USDT'),
            fiatOnly: activeAccounts.filter(a => !(['crypto'].includes(a.type) || a.currency === 'USDT'))
        };
    }, [accountsStatus]);

    const formatCurrency = (amount: number, currency: string) => {
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
        switch (type) {
            case 'wallet': return <Wallet className="w-5 h-5" />;
            case 'crypto': return <Bitcoin className="w-5 h-5" />;
            case 'bank': return <Landmark className="w-5 h-5" />;
            case 'cash': return <Banknote className="w-5 h-5" />;
            case 'card': return <CreditCard className="w-5 h-5" />;
            default: return <DollarSign className="w-5 h-5" />;
        }
    };

    const AccountCard = ({ account }: { account: AccountStatus }) => {
        const rate = rates[account.currency] || 1;
        return (
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2 rounded-xl bg-emerald-50 text-emerald-600`}>
                        {getIcon(account.type)}
                    </div>
                    <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{account.name}</h3>
                        {account.currency !== 'RUB' && (
                            <div className="text-xs text-gray-400 font-medium mt-0.5">
                                Rate: {rate.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        )}
                    </div>
                </div>
                <div className="space-y-1">
                    <div className={`text-2xl font-bold ${account.current < 0 ? 'text-red-500' : 'text-gray-900'}`}>
                        {formatCurrency(account.current, account.currency)}
                    </div>
                    <div className="text-sm text-gray-500 font-medium">
                        ≈ {formatCurrency(account.rubEquivalent, 'RUB')}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
            {/* Header / Net Worth */}
            <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-3xl p-8 text-white shadow-lg overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
                <div className="relative z-10">
                    <h2 className="text-emerald-100 font-medium text-lg mb-2">Total Net Worth</h2>
                    <div className="text-5xl font-bold tracking-tight">
                        {formatCurrency(totalNetWorth, 'RUB')}
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-emerald-100 text-sm">
                        {isLoadingRates ? (
                            <TrendingUp className="w-4 h-4 animate-pulse" />
                        ) : isLiveRates ? (
                            <Wifi className="w-4 h-4" />
                        ) : (
                            <WifiOff className="w-4 h-4 text-emerald-300" />
                        )}
                        <span>
                            {isLoadingRates
                                ? 'Updating rates...'
                                : isLiveRates
                                    ? 'Live Market Rates'
                                    : 'Estimated Rates (Offline)'}
                        </span>
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
        </div>
    );
}
