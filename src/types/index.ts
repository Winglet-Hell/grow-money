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
