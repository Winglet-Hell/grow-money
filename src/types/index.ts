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
