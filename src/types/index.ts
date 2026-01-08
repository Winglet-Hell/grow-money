export type Transaction = {
    id: string; // generated ID
    date: string; // ISO string
    category: string;
    amount: number;
    account: string;
    note: string;
    tags?: string;
    originalAmount?: number;
    originalCurrency?: string;
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
    is_hidden?: boolean;
};
