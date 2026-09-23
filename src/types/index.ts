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

    // --- Transfer legs (populated only when type === 'transfer') ---
    // Both sides of an account-to-account move, captured verbatim from the "Переводы" sheet.
    // For same-currency (internal) transfers the "to" side is usually empty.
    fromAmount?: number;   // amount debited from the source account, in fromCurrency
    fromCurrency?: string; // currency of the source (outgoing) account
    toAmount?: number;     // amount credited to the destination account, in toCurrency
    toCurrency?: string;   // currency of the destination (incoming) account
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

// What kind of life event a milestone marks. The kind picks its icon and lets the Milestones
// page cut chapters by one kind only (moves → cities, work → jobs).
export type MilestoneKind = 'move' | 'work' | 'family' | 'purchase' | 'health' | 'study' | 'money' | 'other';

// A moment worth remembering. Milestones are points in time: each one opens a chapter that
// lasts until the next, so periods never have to be entered by hand.
export type Milestone = {
    id: string;
    date: string; // "YYYY-MM-DD"
    title: string;
    kind: MilestoneKind;
    note?: string;
};

// Overtime record: hours worked in a given month, valued at an hourly rate.
export type OvertimeEntry = {
    id: string;
    monthKey: string; // "YYYY-MM"
    hours: number;
    rate?: number; // optional per-entry rate override; falls back to PaycheckConfig.hourlyRate
    note?: string;
};

// Self-reported sales for a month, used by jobs paid a share of turnover.
// One entry per month; a recorded 0 means "no sales", a missing entry means
// "not filled in yet" (such a month can't be reconciled).
export type SalesEntry = {
    monthKey: string; // "YYYY-MM"
    amount: number;
};

// One employer tracked on the Paycheck page. Pay is salary + optional overtime
// + optional commission on sales; the parts a job doesn't use stay at 0.
export type PaycheckJob = {
    id: string;
    name: string; // tab label, e.g. "Addrea" / "Oretex"
    category?: string; // income category treated as this job's paycheck source
    plannedSalary?: number; // expected monthly net salary
    hourlyRate?: number; // default overtime rate (per hour); 0 = job has no overtime
    overtime?: OvertimeEntry[];
    commissionPct?: number; // % of the month's sales paid on top; 0 = no commission
    salesLabel?: string; // what the commission is based on, e.g. "Ozon sales"
    sales?: SalesEntry[];
};

// Salary control configuration (persisted in user settings / localStorage).
// The top-level category/plannedSalary/hourlyRate/overtime fields are the old
// single-job shape — they are migrated into jobs[0] on load and kept only so
// existing saved settings aren't lost.
export type PaycheckConfig = {
    jobs?: PaycheckJob[];
    activeJobId?: string;
    category?: string; // legacy: income category treated as the paycheck source (e.g. "Addrea paycheck")
    plannedSalary?: number; // legacy: expected monthly net salary
    hourlyRate?: number; // legacy: default overtime rate (per hour)
    overtime?: OvertimeEntry[]; // legacy
};
