import React, { useMemo, useState } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ComposedChart,
    Line,
    AreaChart,
    Area,
    ReferenceLine,
    Legend,
    Cell,
    LabelList
} from 'recharts';
import { TrendingUp, Wallet, PiggyBank } from 'lucide-react';
import type { Transaction } from '../types';
import { CategoryTrendsSection } from '../components/CategoryTrendsSection';
import { AnomaliesSection } from '../components/AnomaliesSection';
import { SpendingHeatmap } from '../components/SpendingHeatmap';

interface TrendsPageProps {
    transactions: Transaction[];
}

type Period = '6M' | '1Y' | 'ALL';

export function TrendsPage({ transactions }: TrendsPageProps) {
    const [period, setPeriod] = useState<Period>('6M');

    // 1. Data Processing
    const chartData = useMemo(() => {
        // Helper to get month key
        const getMonthKey = (dateStr: string) => {
            const date = new Date(dateStr);
            return {
                key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
                label: new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date),
                timestamp: date.getTime()
            };
        };

        // Group by month
        const monthlyData = new Map<string, {
            month: string;
            label: string;
            income: number;
            expenses: number;
            timestamp: number;
        }>();

        transactions.forEach(t => {
            const { key, label, timestamp } = getMonthKey(t.date);

            if (!monthlyData.has(key)) {
                monthlyData.set(key, { month: key, label, income: 0, expenses: 0, timestamp });
            }

            const data = monthlyData.get(key)!;
            if (t.type === 'income') {
                data.income += t.amount;
            } else if (t.type === 'expense') {
                data.expenses += Math.abs(t.amount);
            }
        });

        // Convert to array and sort
        const sortedData = Array.from(monthlyData.values())
            .sort((a, b) => a.timestamp - b.timestamp)
            .map(item => {
                const netFlow = item.income - item.expenses;
                const savingsRate = item.income > 0 ? (netFlow / item.income) * 100 : 0;
                return {
                    ...item,
                    netFlow,
                    savingsRate: Math.max(-20, Math.min(100, savingsRate)) // Clamp for better viz
                };
            });

        // Calculate Moving Average BEFORE slicing to preserve history for the first few visible months
        const dataWithTrends = sortedData.map((item, index, array) => {
            const slice = array.slice(Math.max(0, index - 2), index + 1);
            const avgNetFlow = slice.reduce((sum, curr) => sum + curr.netFlow, 0) / slice.length;
            return { ...item, avgNetFlow };
        });

        // Filter by period
        if (period === '6M') {
            return dataWithTrends.slice(-6);
        } else if (period === '1Y') {
            return dataWithTrends.slice(-12);
        }

        return dataWithTrends;
    }, [transactions, period]);

    // 2. KPI Calculation
    const kpis = useMemo(() => {
        if (chartData.length === 0) return { avgIncome: 0, avgSpend: 0, totalSaved: 0 };

        // Exclude current month from averages
        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const completedMonthsData = chartData.filter(d => d.month < currentMonthKey);

        // Fallback to all data if no completed months available (to avoid /0)
        const dataForAverages = completedMonthsData.length > 0 ? completedMonthsData : [];

        const totalIncomeAvg = dataForAverages.reduce((sum, item) => sum + item.income, 0);
        const totalExpensesAvg = dataForAverages.reduce((sum, item) => sum + item.expenses, 0);

        const totalSaved = chartData.reduce((sum, item) => sum + item.netFlow, 0);

        // Average Savings Rate (Weighted by Income would be better, but simple avg of months is easier for now)
        // Weighted: Total Net Flow / Total Income
        // const agvSavingsRate = totalIncomeAvg > 0 ? (totalSaved / totalIncomeAvg / dataForAverages.length) * 100 : 0; // Removed unused
        // Correction: totalSaved is for ALL months, totalIncomeAvg is Monthly Avg.
        // Let's use totals from dataForAverages for consistency.
        const totalIncomeCompleted = dataForAverages.reduce((sum, item) => sum + item.income, 0);
        const totalNetFlowCompleted = dataForAverages.reduce((sum, item) => sum + item.netFlow, 0);
        const weightedSavingsRate = totalIncomeCompleted > 0 ? (totalNetFlowCompleted / totalIncomeCompleted) * 100 : 0;

        return {
            avgIncome: dataForAverages.length > 0 ? totalIncomeAvg / dataForAverages.length : 0,
            avgSpend: dataForAverages.length > 0 ? totalExpensesAvg / dataForAverages.length : 0,
            totalSaved,
            avgSavingsRate: weightedSavingsRate
        };
    }, [chartData]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            maximumFractionDigits: 0
        }).format(val);
    };

    const formatShortValue = (val: any) => {
        const num = Number(val);
        if (isNaN(num)) return '';
        if (Math.abs(num) >= 1000000) return (num / 1000000).toFixed(0) + 'M';
        if (Math.abs(num) >= 1000) return (num / 1000).toFixed(0) + 'k';
        return Math.round(num).toString();
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header & Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Financial Trends</h2>
                    <p className="text-gray-500">Analyze your income, expenses and savings over time</p>
                </div>

                <div className="flex bg-gray-100 p-1 rounded-lg">
                    {(['6M', '1Y', 'ALL'] as Period[]).map((p) => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${period === p
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-900'
                                }`}
                        >
                            {p === '6M' ? 'Last 6 Months' : p === '1Y' ? 'Last Year' : 'All Time'}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KPICard
                    title="Avg. Monthly Income"
                    amount={kpis.avgIncome}
                    icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
                    color="emerald"
                />
                <KPICard
                    title="Avg. Monthly Spend"
                    amount={kpis.avgSpend}
                    icon={<Wallet className="w-5 h-5 text-rose-600" />}
                    color="rose"
                />
                <KPICard
                    title="Total Saved"
                    amount={kpis.totalSaved}
                    icon={<PiggyBank className="w-5 h-5 text-blue-600" />}
                    color="blue"
                />
            </div>

            {/* Spending Activity Heatmap */}
            <SpendingHeatmap transactions={transactions} />

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Chart 1: Income vs Expenses */}
                <ChartCard title="Income vs Expenses">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                            <XAxis
                                dataKey="label"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#6B7280', fontSize: 12, fontFamily: 'inherit' }}
                                dy={10}
                                height={60}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#6B7280', fontSize: 12, fontFamily: 'inherit' }}
                                tickFormatter={(value) => `₽${(value / 1000).toFixed(0)}k`}
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                formatter={(value: number | undefined) => formatCurrency(value || 0)}
                            />
                            <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#6B7280', paddingTop: '10px', fontWeight: 400, fontFamily: 'inherit' }} />
                            <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={50}>
                                <LabelList dataKey="income" position="top" formatter={formatShortValue} style={{ fontSize: '10px', fill: '#6B7280' }} />
                            </Bar>
                            <Bar dataKey="expenses" name="Expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={50}>
                                <LabelList dataKey="expenses" position="top" formatter={formatShortValue} style={{ fontSize: '10px', fill: '#6B7280' }} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                {/* Chart 2: Net Flow Dynamics */}
                <ChartCard title="Net Flow Dynamics">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                            <XAxis
                                dataKey="label"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#6B7280', fontSize: 12, fontFamily: 'inherit' }}
                                dy={10}
                                height={60}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#6B7280', fontSize: 12, fontFamily: 'inherit' }}
                                tickFormatter={(value) => `₽${(value / 1000).toFixed(0)}k`}
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                formatter={(value: number | undefined) => formatCurrency(value || 0)}
                            />
                            <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#6B7280', paddingTop: '10px', fontWeight: 400, fontFamily: 'inherit' }} />
                            <Bar dataKey="netFlow" name="Net Flow" radius={[4, 4, 0, 0]} maxBarSize={50}>
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.netFlow > 0 ? '#10b981' : '#f43f5e'} />
                                ))}
                                <LabelList dataKey="netFlow" position="top" formatter={formatShortValue} style={{ fontSize: '10px', fill: '#6B7280' }} />
                            </Bar>
                            <Line
                                type="monotone"
                                dataKey="avgNetFlow"
                                name="Trend (3mo Avg)"
                                stroke="#6366f1"
                                strokeWidth={2}
                                dot={false}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </ChartCard>

                {/* Chart 3: Savings Rate - Full Width */}
                <div className="lg:col-span-2">
                    <ChartCard
                        title="Savings Rate (%)"
                        headerRight={
                            <div className="flex items-center gap-2">
                                {(() => {
                                    const rate = kpis.avgSavingsRate || 0;
                                    let color = 'bg-gray-100 text-gray-600';
                                    let text = 'Not enough data';

                                    if (rate >= 50) {
                                        color = 'bg-purple-100 text-purple-700';
                                        text = 'Elite Saver (50%+)';
                                    } else if (rate >= 20) {
                                        color = 'bg-emerald-100 text-emerald-700';
                                        text = 'Strong Saver (20%+)';
                                    } else if (rate >= 10) {
                                        color = 'bg-blue-100 text-blue-700';
                                        text = 'Good Start (10%+)';
                                    } else if (rate > 0) {
                                        color = 'bg-orange-100 text-orange-700';
                                        text = 'Needs Work (0-10%)';
                                    } else {
                                        color = 'bg-red-100 text-red-700';
                                        text = 'Critical (Negative)';
                                    }

                                    return (
                                        <div className="group relative">
                                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${color} cursor-help`}>
                                                {text}
                                            </span>

                                            {/* Tooltip */}
                                            <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-white rounded-xl shadow-xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-xs">
                                                <p className="font-semibold text-gray-900 mb-2 pb-2 border-b border-gray-100">Savings Benchmarks</p>
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-purple-700 font-medium">Elite Saver</span>
                                                        <span className="text-gray-500">50%+</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-emerald-700 font-medium">Strong Saver</span>
                                                        <span className="text-gray-500">20-50%</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-blue-700 font-medium">Good Start</span>
                                                        <span className="text-gray-500">10-20%</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-orange-700 font-medium">Needs Work</span>
                                                        <span className="text-gray-500">0-10%</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-red-700 font-medium">Critical</span>
                                                        <span className="text-gray-500">&lt; 0%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        }
                    >
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorSavings" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                    dataKey="label"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#6B7280', fontSize: 12 }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#6B7280', fontSize: 12 }}
                                    unit="%"
                                />
                                <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    formatter={(value: number | undefined) => `${(value || 0).toFixed(1)}%`}
                                />
                                <ReferenceLine y={20} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'Target 20%', fill: '#10b981', fontSize: 12 }} />
                                <Area
                                    type="monotone"
                                    dataKey="savingsRate"
                                    name="Savings Rate"
                                    stroke="#8b5cf6"
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#colorSavings)"
                                >
                                    <LabelList dataKey="savingsRate" position="top" formatter={(val: any) => Math.round(Number(val)) + '%'} style={{ fontSize: '10px', fill: '#6B7280' }} />
                                </Area>
                            </AreaChart>
                        </ResponsiveContainer>
                    </ChartCard>
                </div>

                {/* Category Trends Section - Full Width */}
                <div className="lg:col-span-2">
                    <CategoryTrendsSection transactions={transactions} period={period} />
                </div>

                {/* Anomalies Section - Full Width */}
                <div className="lg:col-span-2">
                    <AnomaliesSection transactions={transactions} />
                </div>
            </div>
        </div>
    );
}

// Sub-components for cleaner code
function KPICard({ title, amount, icon, color }: { title: string; amount: number; icon: React.ReactNode; color: 'emerald' | 'rose' | 'blue' }) {
    const bgColors = {
        emerald: 'bg-emerald-50',
        rose: 'bg-rose-50',
        blue: 'bg-blue-50'
    };

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-shadow">
            <div>
                <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
                <h3 className="text-2xl font-bold text-gray-900">
                    {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(amount)}
                </h3>
            </div>
            <div className={`p-3 rounded-lg ${bgColors[color]} group-hover:scale-110 transition-transform`}>
                {icon}
            </div>
        </div>
    );
}

function ChartCard({ title, children, headerRight }: { title: string; children: React.ReactNode; headerRight?: React.ReactNode }) {
    return (
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm h-[400px] flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                {headerRight}
            </div>
            <div className="flex-1 w-full min-h-0">
                {children}
            </div>
        </div>
    );
}
