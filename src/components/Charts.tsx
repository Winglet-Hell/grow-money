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

export const Charts: React.FC<ChartsProps> = React.memo(({ transactions }) => {
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

        return Object.entries(categories)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [transactions]);

    const monthlySpending = useMemo(() => {
        const months: Record<string, number> = {};

        transactions
            .filter(t => t.type === 'expense')
            .forEach(t => {
                const dateKey = t.date.slice(0, 7); // Assuming YYYY-MM-DD or DD.MM.YYYY
                let key = '';

                if (t.date.includes('-')) {
                    key = dateKey; // YYYY-MM
                } else if (t.date.includes('.')) {
                    // DD.MM.YYYY -> YYYY-MM
                    const parts = t.date.split('.');
                    if (parts.length >= 3) {
                        key = `${parts[2]}-${parts[1]}`;
                    }
                }

                if (key) {
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

    // Pre-calculate max for severity colors and current month string
    const { maxValue, currentMonthStr } = useMemo(() => ({
        maxValue: Math.max(...monthlySpending.map(m => m.value), 0),
        currentMonthStr: new Date().toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
    }), [monthlySpending]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Category Bar Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col h-96">
                <h3 className="text-lg font-semibold text-gray-800 mb-6 flex-shrink-0">Expenses by Category</h3>
                <div className="flex-1 overflow-x-auto pb-2 min-h-0">
                    {expensesByCategory.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                            No data available
                        </div>
                    ) : (
                        <div style={{ minWidth: '100%', width: Math.max(expensesByCategory.length * 80, 300), height: '100%' }}>
                            <ResponsiveContainer width="100%" height="100%">
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
                    )}
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
                                        const isCurrent = entry.name === currentMonthStr;
                                        const color = isCurrent
                                            ? '#cbd5e1' // Gray for incomplete (current) month
                                            : getSeverityColor(entry.value, maxValue);

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
});
