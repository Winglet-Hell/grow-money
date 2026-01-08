import React, { useMemo } from 'react';
import { ArrowUpCircle, ArrowDownCircle, Wallet } from 'lucide-react';
import type { Transaction } from '../types';
import { usePrivacy } from '../contexts/PrivacyContext';
import { MetricCard } from './MetricCard';

interface SummaryCardsProps {
    transactions: Transaction[];
}

export const SummaryCards: React.FC<SummaryCardsProps> = React.memo(({ transactions }) => {
    const { isPrivacyMode } = usePrivacy();

    // Calculate income and expenses
    const { income, expenses, netBalance } = useMemo(() => {
        const income = transactions
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0);

        const expenses = transactions
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + Math.abs(t.amount), 0);

        return {
            income,
            expenses,
            netBalance: income - expenses
        };
    }, [transactions]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <MetricCard
                title="Total Income"
                amount={income}
                icon={<ArrowUpCircle className="w-10 h-10 text-emerald-500" strokeWidth={1.5} />}
                trend="Good job!"
                isPrivacy={isPrivacyMode}
            />
            <MetricCard
                title="Total Expenses"
                amount={expenses}
                icon={<ArrowDownCircle className="w-10 h-10 text-red-500" strokeWidth={1.5} />}
                isPrivacy={isPrivacyMode}
            />
            <MetricCard
                title="Net Balance"
                amount={netBalance}
                icon={<Wallet className="w-10 h-10 text-blue-500" strokeWidth={1.5} />}
                isPrivacy={isPrivacyMode}
            />
        </div>
    );
});
