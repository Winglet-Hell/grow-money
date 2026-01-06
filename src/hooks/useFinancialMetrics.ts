import { useMemo } from 'react';
import type { Transaction } from '../types';

export function useFinancialMetrics(transactions: Transaction[], monthsToAnalyze: number = 6) {
    const metrics = useMemo(() => {
        if (transactions.length === 0) {
            return {
                averageIncome: 0,
                averageExpense: 0,
                monthlySavingPower: 0,
                monthsAnalyzed: 0
            };
        }

        // 1. Group by Month (YYYY-MM)
        const monthlyStats = new Map<string, { income: number; expense: number }>();
        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        transactions.forEach(t => {
            const date = new Date(t.date);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            // Skip current incomplete month for better accuracy
            // But if we have no history, maybe include it? 
            // Let's exclude current month to be safe as requested ("last 3-6 months")
            if (key === currentMonthKey) return;

            if (!monthlyStats.has(key)) {
                monthlyStats.set(key, { income: 0, expense: 0 });
            }

            const stats = monthlyStats.get(key)!;

            // Assuming positive amounts for income, negative for expense (as per AccountsPage logic inferred)
            // Wait, in AccountsPage I saw:
            // if (t.type === 'income') balances[idx].current += t.amount;
            // if (t.type === 'expense') balances[idx].current -= t.amount; (if amount > 0)
            // This suggests amount in transaction object is usually positive for expense?
            // SummaryCards says: income += t.amount; expense += Math.abs(t.amount).
            // So let's handle both.

            if (t.type === 'income') {
                stats.income += Math.abs(t.amount);
            } else if (t.type === 'expense') {
                stats.expense += Math.abs(t.amount);
            }
        });

        // 2. Filter last N months
        const sortedMonths = Array.from(monthlyStats.keys()).sort().reverse(); // Newest first
        const recentMonths = sortedMonths.slice(0, monthsToAnalyze);

        if (recentMonths.length === 0) {
            return {
                averageIncome: 0,
                averageExpense: 0,
                monthlySavingPower: 0,
                monthsAnalyzed: 0
            };
        }

        // 3. Calculate Averages
        let totalIncome = 0;
        let totalExpense = 0;

        recentMonths.forEach(key => {
            const stats = monthlyStats.get(key)!;
            totalIncome += stats.income;
            totalExpense += stats.expense;
        });

        const avgIncome = totalIncome / recentMonths.length;
        const avgExpense = totalExpense / recentMonths.length;
        const savingPower = avgIncome - avgExpense;

        return {
            averageIncome: avgIncome,
            averageExpense: avgExpense,
            monthlySavingPower: savingPower,
            monthsAnalyzed: recentMonths.length
        };
    }, [transactions, monthsToAnalyze]);

    return metrics;
}
