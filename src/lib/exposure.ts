// Net-worth exposure groups, shared by the Wallets page's currency bar and the net-worth chart:
// dollar stablecoins are dollars for this purpose, and small currencies share "Other".
export const EXPOSURE_COLORS: Record<string, string> = {
    RUB: '#10b981',
    USD: '#3b82f6',
    THB: '#f59e0b',
    BTC: '#f97316',
    ETH: '#8b5cf6',
    Other: '#94a3b8',
};

export const exposureGroup = (currency: string) => {
    if (currency === 'USDT' || currency === 'USDC' || currency === 'USD') return 'USD';
    return currency in EXPOSURE_COLORS ? currency : 'Other';
};

/** How a group is named next to its colour. */
export const exposureLabel = (group: string) => (group === 'USD' ? 'USD·USDT' : group);
