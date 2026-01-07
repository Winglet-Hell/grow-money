import React from 'react';
import { ArrowUpCircle, ArrowDownCircle, Wallet } from 'lucide-react';
import type { Transaction } from '../types';

interface SummaryCardsProps {
    transactions: Transaction[];
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ transactions }) => {
    const income = transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

    const expenses = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    // const balance = income - expenses;
    // User said "Amount" is "Сумма в валюте учета". Usually expenses are negative in bank statements.
    // Assuming they are negative. If not, logic needs adjustment. 
    // For safety, I'll assume standard bank format where expense is negative.
    // But wait, "Expenses by Category" implies I should know what is expense.
    // If "amount" is positive for expense in the file (rare but possible), I'd need logic.
    // I will assume: Positive = Income, Negative = Expense.

    // Re-calculating balance simply as sum
    const netBalance = transactions.reduce((sum, t) => sum + t.amount, 0);

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card
                title="Total Income"
                amount={income}
                icon={<ArrowUpCircle className="w-6 h-6 text-emerald-500" />}
                trend="Good job!"
            />
            <Card
                title="Total Expenses"
                amount={expenses}
                icon={<ArrowDownCircle className="w-6 h-6 text-red-500" />}

            />
            <Card
                title="Net Balance"
                amount={netBalance}
                icon={<Wallet className="w-6 h-6 text-blue-500" />}
            />
        </div>
    );
};

const Card = ({ title, amount, icon, trend }: any) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-start justify-between">
        <div>
            <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
            <h3 className="text-2xl font-bold text-gray-900">
                {new Intl.NumberFormat('ru-RU', {
                    style: 'currency',
                    currency: 'RUB',
                    maximumFractionDigits: 0
                }).format(amount)}
            </h3>
            {trend && <p className="text-xs text-emerald-600 mt-2 font-medium">{trend}</p>}
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
            {icon}
        </div>
    </div>
);
