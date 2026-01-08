import React, { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList
} from 'recharts';
import type { Transaction } from '../types';
import { usePrivacy } from '../contexts/PrivacyContext';
import { stringToColor } from '../lib/utils';
import { getCategoryIcon } from '../lib/categoryIcons';
import { CustomTooltip } from './CustomTooltip';

interface ChartsProps {
    transactions: Transaction[];
}

const formatCompact = (num: any) => {
    if (typeof num !== 'number') return '';
    return new Intl.NumberFormat('en-US', {
        notation: "compact",
        maximumFractionDigits: 0
    }).format(num);
};

const getSeverityColor = (value: number, max: number) => {
    const ratio = value / max;
    if (ratio < 0.5) return '#10B981'; // Green (Low)
    if (ratio < 0.8) return '#F59E0B'; // Yellow/Orange (Medium)
    return '#EF4444'; // Red (High)
};

const truncateLabel = (str: string) => {
    return str.length > 10 ? str.slice(0, 8) + '..' : str;
};

const CustomXAxisTick = (props: any) => {
    const { x, y, payload } = props;
    const Icon = getCategoryIcon(payload.value);

    return (
        <g transform={`translate(${x},${y})`}>
            <foreignObject x={-12} y={0} width={24} height={24}>
                <div className="flex items-center justify-center w-full h-full text-gray-500">
                    <Icon size={16} />
                </div>
            </foreignObject>
            <text x={0} y={32} textAnchor="middle" fill="#6B7280" fontSize={12}>
                {truncateLabel(payload.value)}
            </text>
        </g>
    );
};

export const Charts: React.FC<ChartsProps> = ({ transactions }) => {
    const { isPrivacyMode } = usePrivacy();
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
                    // Use sortable key YYYY-MM
                    const year = dateObj.getFullYear();
                    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const key = `${year}-${month}`;
                    months[key] = (months[key] || 0) + Math.abs(t.amount);
                }
            });

        return Object.entries(months)
            .sort((a, b) => b[0].localeCompare(a[0])) // Sort descending (Newest first)
            .map(([key, value]) => {
                const [year, month] = key.split('-');
                const date = new Date(parseInt(year), parseInt(month) - 1);
                return {
                    name: date.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
                    value
                };
            });
    }, [transactions]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Category Bar Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col h-96">
                <h3 className="text-lg font-semibold text-gray-800 mb-6 flex-shrink-0">Expenses by Category</h3>
                <div className="flex-1 overflow-x-auto pb-2">
                    <div style={{ minWidth: '100%', width: Math.max(expensesByCategory.length * 80, 300), height: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            <BarChart data={expensesByCategory} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    interval={0}
                                    tick={<CustomXAxisTick />}
                                    height={50}
                                />
                                <YAxis hide />
                                <Tooltip content={<CustomTooltip isPrivacy={isPrivacyMode} />} cursor={{ fill: 'rgba(249, 250, 251, 0.5)' }} />
                                <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={48} isAnimationActive={false}>
                                    <LabelList
                                        dataKey="value"
                                        position="top"
                                        formatter={(val: any) => isPrivacyMode ? '' : formatCompact(val)}
                                        style={{ fontSize: '12px', fill: '#6b7280', fontWeight: 500 }}
                                    />
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
                    <div style={{ minWidth: '100%', width: Math.max(monthlySpending.length * 80, 300), height: '100%' }}>
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
                                <Tooltip content={<CustomTooltip isPrivacy={isPrivacyMode} />} cursor={{ fill: 'rgba(249, 250, 251, 0.5)' }} />
                                <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={48} isAnimationActive={false}>
                                    <LabelList
                                        dataKey="value"
                                        position="top"
                                        formatter={(val: any) => isPrivacyMode ? '' : formatCompact(val)}
                                        style={{ fontSize: '12px', fill: '#6b7280', fontWeight: 500 }}
                                    />
                                    {monthlySpending.map((entry, index) => {
                                        const current = new Date().toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
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
