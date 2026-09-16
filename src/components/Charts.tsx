import React, { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList, ReferenceLine
} from 'recharts';
import type { Transaction } from '../types';
import { usePrivacy } from '../contexts/PrivacyContext';
import { stringToColor } from '../lib/utils';
import { getCategoryIcon } from '../lib/categoryIcons';
import { CustomTooltip } from './CustomTooltip';
import { filterByPeriod, monthKeyOf, monthKeyFromDate, monthLabel, type DashboardPeriod } from '../lib/periods';

interface ChartsProps {
    transactions: Transaction[];
    period: DashboardPeriod;
    budget?: number;                          // monthly target line (sum of category limits)
    onSelectMonth?: (key: string) => void;    // click on a month bar scopes the dashboard to it
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

export const Charts: React.FC<ChartsProps> = React.memo(({ transactions, period, budget = 0, onSelectMonth }) => {
    const { isPrivacyMode } = usePrivacy();

    const periodTitle = period.kind === 'all' ? 'All time' : monthLabel(period.key);

    const expensesByCategory = useMemo(() => {
        const categories: Record<string, number> = {};

        filterByPeriod(transactions, period)
            .filter(t => t.type === 'expense') // expenses only
            .forEach(t => {
                const cat = t.category || 'Other';
                const amount = Math.abs(t.amount);
                categories[cat] = (categories[cat] || 0) + amount;
            });

        return Object.entries(categories)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [transactions, period]);

    const monthlySpending = useMemo(() => {
        const months: Record<string, number> = {};

        transactions
            .filter(t => t.type === 'expense')
            .forEach(t => {
                const key = monthKeyOf(t.date);
                if (key) months[key] = (months[key] || 0) + Math.abs(t.amount);
            });

        return Object.entries(months)
            .sort((a, b) => b[0].localeCompare(a[0])) // Sort descending (Newest first)
            .map(([key, value]) => ({
                key,
                name: monthLabel(key, 'short').replace(/ (\d{2})(\d{2})$/, ' $2'), // "Sep 26"
                value
            }));
    }, [transactions]);

    // Pre-calculate max for severity colors and the running month's key
    const { maxValue, currentMonthKey } = useMemo(() => ({
        maxValue: Math.max(...monthlySpending.map(m => m.value), 0),
        currentMonthKey: monthKeyFromDate(new Date())
    }), [monthlySpending]);

    const selectedKey = period.kind === 'month' ? period.key : null;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Category Bar Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col h-96">
                <div className="flex items-baseline justify-between gap-3 mb-6 flex-shrink-0">
                    <h3 className="text-lg font-semibold text-gray-800">Expenses by Category</h3>
                    <span className="text-xs font-medium text-gray-400 whitespace-nowrap">{periodTitle}</span>
                </div>
                <div className="flex-1 overflow-x-auto pb-2 min-h-0">
                    {expensesByCategory.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                            No expenses in this period
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
                                    <Bar dataKey="value" name="Spent" radius={[8, 8, 0, 0]} barSize={48} isAnimationActive={false}>
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
                <div className="flex items-baseline justify-between gap-3 mb-6 flex-shrink-0">
                    <h3 className="text-lg font-semibold text-gray-800">Monthly Spending Trend</h3>
                    {onSelectMonth && (
                        <span className="text-xs font-medium text-gray-400 whitespace-nowrap hidden sm:inline">Click a month to focus</span>
                    )}
                </div>
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
                                {budget > 0 && (
                                    <ReferenceLine
                                        y={budget}
                                        stroke="#f97316"
                                        strokeDasharray="4 4"
                                        strokeWidth={2}
                                        label={({ viewBox }: any) => (
                                            <text x={viewBox.x + 5} y={viewBox.y - 8} fill="#f97316" fontSize={12} fontWeight={600}>
                                                Target
                                            </text>
                                        )}
                                    />
                                )}
                                <Bar
                                    dataKey="value"
                                    name="Spent"
                                    radius={[8, 8, 0, 0]}
                                    barSize={48}
                                    isAnimationActive={false}
                                    cursor={onSelectMonth ? 'pointer' : undefined}
                                    onClick={(entry: any) => {
                                        const key = entry?.key ?? entry?.payload?.key;
                                        if (key && onSelectMonth) onSelectMonth(key);
                                    }}
                                >
                                    <LabelList
                                        dataKey="value"
                                        position="top"
                                        formatter={(val: any) => isPrivacyMode ? '' : formatCompact(val)}
                                        style={{ fontSize: '12px', fill: '#6b7280', fontWeight: 500 }}
                                    />
                                    {monthlySpending.map((entry, index) => {
                                        const isCurrent = entry.key === currentMonthKey;
                                        const color = isCurrent
                                            ? '#cbd5e1' // Gray for incomplete (current) month
                                            : getSeverityColor(entry.value, maxValue);
                                        // Everything but the focused month fades back.
                                        const dimmed = selectedKey !== null && entry.key !== selectedKey;

                                        return <Cell key={`cell-${index}`} fill={color} fillOpacity={dimmed ? 0.3 : 1} />;
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
