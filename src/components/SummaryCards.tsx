import React, { useMemo } from 'react';
import { ArrowUpCircle, ArrowDownCircle, Wallet, Gauge, CalendarDays } from 'lucide-react';
import type { Transaction } from '../types';
import { usePrivacy } from '../contexts/PrivacyContext';
import { MetricCard } from './MetricCard';
import { summarizePeriod, formatDelta, monthLabel, type DashboardPeriod } from '../lib/periods';

interface SummaryCardsProps {
    transactions: Transaction[];
    period: DashboardPeriod;
    budget?: number; // sum of category limits per month; 0 / undefined when none are set
}

const rub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });

export const SummaryCards: React.FC<SummaryCardsProps> = React.memo(({ transactions, period, budget = 0 }) => {
    const { isPrivacyMode } = usePrivacy();

    const s = useMemo(() => summarizePeriod(transactions, period), [transactions, period]);

    // Amounts inside the small print must respect privacy mode too.
    const money = (n: number) => (isPrivacyMode ? '••••' : rub.format(n));
    const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;

    const savingsTrend = s.savingsRate === null
        ? { text: 'No income in this period', color: 'text-gray-400' }
        : {
            text: `Savings rate ${pct(s.savingsRate)}`,
            color: s.savingsRate >= 0.2 ? 'text-emerald-600' : s.savingsRate >= 0 ? 'text-amber-600' : 'text-red-500',
        };

    // Spending deltas read "up is bad": red when spending rose, green when it fell.
    const spendDelta = (current: number, previous: number | undefined, suffix: string) => {
        const delta = formatDelta(current, previous);
        if (!delta) return undefined;
        const color = delta.startsWith('+') ? 'text-red-500' : delta.startsWith('−') ? 'text-emerald-600' : 'text-gray-500';
        return { text: `${delta} ${suffix}`, color };
    };
    const incomeDelta = (current: number, previous: number | undefined, suffix: string) => {
        const delta = formatDelta(current, previous);
        if (!delta) return undefined;
        const color = delta.startsWith('+') ? 'text-emerald-600' : delta.startsWith('−') ? 'text-red-500' : 'text-gray-500';
        return { text: `${delta} ${suffix}`, color };
    };

    if (period.kind === 'all') {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6 mb-8">
                <MetricCard
                    title="Total Income"
                    amount={s.income}
                    icon={<ArrowUpCircle className="w-10 h-10 text-emerald-500" strokeWidth={1.5} />}
                    description={s.completedMonths > 0
                        ? `${s.completedMonths} completed months · avg ${money(s.avgMonthlyIncome)}/mo`
                        : 'All imported data'}
                    isPrivacy={isPrivacyMode}
                />
                <MetricCard
                    title="Total Expenses"
                    amount={s.expenses}
                    icon={<ArrowDownCircle className="w-10 h-10 text-red-500" strokeWidth={1.5} />}
                    description={s.completedMonths > 0 ? `avg ${money(s.avgMonthlyExpenses)}/mo` : 'All imported data'}
                    isPrivacy={isPrivacyMode}
                />
                <MetricCard
                    title="Net Balance"
                    amount={s.net}
                    icon={<Wallet className="w-10 h-10 text-blue-500" strokeWidth={1.5} />}
                    trend={savingsTrend.text}
                    trendColor={savingsTrend.color}
                    description="Income minus expenses, all time"
                    isPrivacy={isPrivacyMode}
                />
                <MetricCard
                    title="Avg. Monthly Spend"
                    amount={s.avgMonthlyExpenses}
                    icon={<Gauge className="w-10 h-10 text-violet-500" strokeWidth={1.5} />}
                    description={budget > 0
                        ? `Budget ${money(budget)}/mo · avg uses ${pct(s.avgMonthlyExpenses / budget)}`
                        : 'The running month is left out'}
                    isPrivacy={isPrivacyMode}
                />
            </div>
        );
    }

    // ---- One calendar month ----
    const prevShort = s.prevMonthKey ? monthLabel(s.prevMonthKey, 'month') : '';
    const day = s.dayOfMonth ?? 0;
    const total = s.daysInMonth ?? 0;

    const expenseTrend = s.isCurrentMonth
        ? spendDelta(s.expenses, s.prevExpensesToDate, `vs ${prevShort} to date`)
        : spendDelta(s.expenses, s.prevExpensesFull, `vs ${prevShort}`);
    const expenseDescription = s.isCurrentMonth
        ? (s.prevExpensesToDate !== undefined
            ? `${prevShort} by day ${day}: ${money(s.prevExpensesToDate)}`
            : 'No previous month to compare')
        : (s.completedMonths > 0 ? `Avg. month: ${money(s.avgMonthlyExpenses)}` : undefined);

    const incomeTrend = s.isCurrentMonth ? undefined : incomeDelta(s.income, s.prevIncome, `vs ${prevShort}`);
    const incomeDescription = s.isCurrentMonth
        ? (s.prevIncome !== undefined
            ? `${prevShort}: ${money(s.prevIncome)} · avg ${money(s.avgMonthlyIncome)}`
            : 'No previous month to compare')
        : (s.completedMonths > 0 ? `Avg. month: ${money(s.avgMonthlyIncome)}` : undefined);

    // Pace card: where the month is heading (running month) or how it went (finished one).
    let paceTrend: { text: string; color: string } | undefined;
    let paceDescription: React.ReactNode;
    if (s.isCurrentMonth && s.projectedExpenses !== undefined) {
        const reference = budget > 0 ? budget : s.avgMonthlyExpenses;
        const over = reference > 0 && s.projectedExpenses > reference;
        paceTrend = {
            text: `Month-end ≈ ${money(s.projectedExpenses)}${reference > 0 ? (over ? ' · above ' : ' · within ') + (budget > 0 ? 'budget' : 'average') : ''}`,
            color: reference > 0 ? (over ? 'text-red-500' : 'text-emerald-600') : 'text-gray-500',
        };
        const basis = s.projectionBasis === 'history'
            ? `Spent so far plus what you usually spend after day ${day} of a month`
            : 'Spent so far, continued at the same daily pace';
        paceDescription = (
            <span title={basis} className="cursor-help">
                Day {day} of {total}{budget > 0 ? ` · budget ${pct(s.expenses / budget)} used` : ''}
            </span>
        );
    } else {
        if (budget > 0) {
            const used = s.expenses / budget;
            paceTrend = { text: `Budget ${pct(used)} used`, color: used > 1 ? 'text-red-500' : used > 0.85 ? 'text-amber-600' : 'text-emerald-600' };
        }
        paceDescription = `${total} days`;
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6 mb-8">
            <MetricCard
                title="Income"
                amount={s.income}
                icon={<ArrowUpCircle className="w-10 h-10 text-emerald-500" strokeWidth={1.5} />}
                trend={incomeTrend?.text}
                trendColor={incomeTrend?.color}
                description={incomeDescription}
                isPrivacy={isPrivacyMode}
            />
            <MetricCard
                title="Expenses"
                amount={s.expenses}
                icon={<ArrowDownCircle className="w-10 h-10 text-red-500" strokeWidth={1.5} />}
                trend={expenseTrend?.text}
                trendColor={expenseTrend?.color}
                description={expenseDescription}
                isPrivacy={isPrivacyMode}
            />
            <MetricCard
                title="Saved"
                amount={s.net}
                icon={<Wallet className="w-10 h-10 text-blue-500" strokeWidth={1.5} />}
                trend={savingsTrend.text}
                trendColor={savingsTrend.color}
                description="Income minus expenses"
                isPrivacy={isPrivacyMode}
            />
            <MetricCard
                title={s.isCurrentMonth ? 'Daily Pace' : 'Daily Average'}
                amount={s.dailyAverage ?? 0}
                icon={<CalendarDays className="w-10 h-10 text-violet-500" strokeWidth={1.5} />}
                trend={paceTrend?.text}
                trendColor={paceTrend?.color}
                description={paceDescription}
                isPrivacy={isPrivacyMode}
            />
        </div>
    );
});
