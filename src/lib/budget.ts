import type { Transaction } from '../types';

/**
 * The category limits that actually budget something: those set on an expense category
 * that appears in the data. Rows left behind on names the statement doesn't use — a
 * category renamed in the source app, one from the demo data, a group name such as
 * "Shopping" — are ignored, so the dashboard, the Expenses page and the AI export all add
 * up the same monthly budget.
 */
export function activeLimits(limits: Record<string, number>, transactions: Transaction[]): Record<string, number> {
    const categories = new Set(transactions.filter(t => t.type === 'expense').map(t => t.category));
    return Object.fromEntries(
        Object.entries(limits).filter(([category, amount]) => typeof amount === 'number' && amount > 0 && categories.has(category))
    );
}

/** The active limits added up; 0 when none are set. */
export function monthlyBudget(limits: Record<string, number>, transactions: Transaction[]): number {
    return Object.values(activeLimits(limits, transactions)).reduce((sum, v) => sum + v, 0);
}
