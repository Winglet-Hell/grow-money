export type Transaction = {
    id: string; // generated ID
    date: string; // ISO string
    category: string;
    amount: number;
    account: string;
    note: string;
    originalCurrency?: string;
    originalAmount?: number;
    tags?: string[];
    index?: number; // Row index for sorting same-day transactions
    currency?: string; // Explicit currency for this transaction (overrides account default)
    type: 'expense' | 'income' | 'transfer';
};

export type Account = {
    id: string;
    created_at?: string;
    user_id?: string | null;
    name: string;
    type: 'wallet' | 'crypto' | 'bank' | 'cash' | 'card';
    currency: string;
    balance: number;
    balance_date?: string; // ISO date string for checkpoint
    balance_checkpoint_tx_id?: string; // ID of the last transaction included in this balance
    is_hidden?: boolean;
};

export type Trip = {
    id: string; // generated ID
    name: string;
    startDate: string; // ISO string
    endDate: string; // ISO string
    excludedTransactionIds: string[]; // List of transaction IDs to exclude
    additionalTransactionIds?: string[]; // List of transaction IDs to manually include (e.g. outside date range)
    transactionSnapshots?: Record<string, TransactionSnapshot>; // Map of ID -> Snapshot for recovery
};

export type TransactionSnapshot = {
    date: string;
    amount: number;
    category: string;
    note: string;
    originalCurrency?: string;
};
