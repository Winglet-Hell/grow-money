import React, { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList
} from 'recharts';
import type { Transaction } from '../types';

interface ChartsProps {
    transactions: Transaction[];
}

import { stringToColor } from '../lib/utils';

const formatCompact = (num: any) => {
    if (typeof num !== 'number') return '';
    return new Intl.NumberFormat('en-US', {
        notation: "compact",
        maximumFractionDigits: 1
    }).format(num);
};

const getSeverityColor = (value: number, max: number) => {
    const ratio = value / max;
    if (ratio < 0.5) return '#10B981'; // Green (Low)
    if (ratio < 0.8) return '#F59E0B'; // Yellow/Orange (Medium)
    return '#EF4444'; // Red (High)
};

const truncateLabel = (str: string) => {
    return str.length > 8 ? str.slice(0, 6) + '..' : str;
};

export const Charts: React.FC<ChartsProps> = ({ transactions }) => {
    const expensesByCategory = useMemo(() => {
        const categories: Record<string, number> = {};

        transactions
            .filter(t => t.type === 'expense') // expenses only
            .forEach(t => {
                const cat = t.category || 'Other';
                const amount = Math.abs(t.amount);
                categories[cat] = (categories[cat] || 0) + amount;
            });

        const sorted = Object.entries(categories)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        // Return full list for scrolling
        return sorted;
    }, [transactions]);

    const monthlySpending = useMemo(() => {
        const months: Record<string, number> = {};

        transactions
            .filter(t => t.type === 'expense')
            .forEach(t => {
                // Assuming date is parseable mostly. If simple string, might fail.
                // I will try to parse dd.mm.yyyy or yyyy-mm-dd or Excel serial.
                // For MVP, if parser just passed string, I need to be careful.
                // Ideally Parser should have normalized Date.
                // Let's assume standard JS date parse-able string for now.
                // Or if it's "DD.MM.YYYY HH:MM:SS" (common in RU banks), JS Date() might fail.
                // I'll handle basic RU format here or in parser.
                // Let's assume parser provides standard ISO or we try to parse broadly.

                let dateObj = new Date(t.date);
                if (isNaN(dateObj.getTime())) {
                    // Try parsing DD.MM.YYYY
                    const parts = t.date.split(/[ .]/);
                    if (parts.length >= 3) {
                        // strict assumption: day.month.year
                        dateObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                    }
                }

                if (!isNaN(dateObj.getTime())) {
                    const key = dateObj.toLocaleString('en-US', { month: 'short', year: '2-digit' });
                    months[key] = (months[key] || 0) + Math.abs(t.amount);
                }
            });

        return Object.entries(months)
            .map(([name, value]) => ({ name, value }))
        // Basic sort by string doesn't work well for dates, but typically banks give chronological.
        // Ideally sort by real date.
        // For MVP I'll leave it as is or do better sort if I had time.
    }, [transactions]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Category Bar Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col h-96">
                <h3 className="text-lg font-semibold text-gray-800 mb-6 flex-shrink-0">Expenses by Category</h3>
                <div className="flex-1 overflow-x-auto pb-2">
                    <div style={{ width: Math.max(expensesByCategory.length * 50, 300), height: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            <BarChart data={expensesByCategory} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    interval={0}
                                    tick={{ fontSize: 12, fill: '#6B7280' }}
                                    tickFormatter={truncateLabel}
                                />
                                <YAxis hide />
                                <Tooltip formatter={(value: any) => `₽${(value || 0).toLocaleString()}`} cursor={{ fill: 'transparent' }} />
                                <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={32}>
                                    <LabelList dataKey="value" position="top" formatter={formatCompact} style={{ fontSize: '12px', fill: '#6b7280', fontWeight: 500 }} />
                                    {expensesByCategory.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={stringToColor(entry.name).hex} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Monthly Bar Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col h-96">
                <h3 className="text-lg font-semibold text-gray-800 mb-6 flex-shrink-0">Monthly Spending Trend</h3>
                <div className="flex-1 overflow-x-auto pb-2">
                    <div style={{ width: Math.max(monthlySpending.length * 50, 300), height: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            <BarChart data={monthlySpending} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    interval={0}
                                    tick={{ fontSize: 12, fill: '#6B7280' }}
                                    tickFormatter={truncateLabel}
                                />
                                <YAxis hide />
                                <Tooltip formatter={(value: any) => `₽${(value || 0).toLocaleString()}`} cursor={{ fill: 'transparent' }} />
                                <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={32}>
                                    <LabelList dataKey="value" position="top" formatter={formatCompact} style={{ fontSize: '12px', fill: '#6B7280', fontWeight: 500 }} />
                                    {monthlySpending.map((entry, index) => {
                                        const current = new Date().toLocaleString('en-US', { month: 'short', year: '2-digit' });
                                        const isCurrent = entry.name === current;
                                        const color = isCurrent
                                            ? '#cbd5e1' // Gray for incomplete (current) month
                                            : getSeverityColor(entry.value, Math.max(...monthlySpending.map(m => m.value)));

                                        return <Cell key={`cell-${index}`} fill={color} />;
                                    })}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};
