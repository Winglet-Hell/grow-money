import { budgetStatus, tripMetrics } from '../../src/lib/tripStats';
import { resolveTrip, tripStatus } from '../../src/lib/tripUtils';
import { analystPayload, type Context } from '../context';
import { etaOf, goalPlans } from './goals';
import { walletSourceNote } from './wallets';
import { exposure, round } from './common';

// One call for the big picture, what the dashboard and the Wallets page show at a glance, plus
// where the data comes from and how fresh it is.

export function getOverview(ctx: Context) {
    const p = analystPayload(ctx);
    const { currentMonth, monthly, budget, recurring } = p;
    const topOf = (month: string | null, n = 6) =>
        Object.entries((month && p.expenses.monthlyByCategory[month]) || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, n)
            .map(([category, rub]) => ({ category, rub }));
    const lastComplete = [...monthly.rows].reverse().find(m => !m.isPartial && (m.expenseCount > 0 || m.incomeCount > 0)) ?? null;

    const txs = ctx.statement.transactions;
    const { trips } = ctx.app;
    const summarize = (t: (typeof trips)[number]) => {
        const m = tripMetrics(t, trips, txs, resolveTrip(t, txs));
        const b = budgetStatus(t, m, ctx.today);
        return { name: t.name, startDate: t.startDate, endDate: t.endDate, totalRub: round(m.total), ...(b ? { budgetRub: round(b.budget), budgetLeftRub: round(b.left) } : {}) };
    };
    const withStatus = (status: string) => trips.filter(t => tripStatus(t, ctx.today) === status);
    const lastTrip = withStatus('past').slice(0, 1).map(summarize)[0] ?? null; // trips are kept newest first

    let goals: unknown = null;
    if (ctx.app.goals) {
        const { pace, plans } = goalPlans(ctx);
        const next = plans.find(g => g.costRub !== null && !g.reachedNow);
        goals = {
            open: plans.length,
            savingPacePerMonthRub: pace ? round(pace.perMonth) : null,
            next: next ? { name: next.goal.name, costRub: round(next.costRub!), eta: next.date, inAbout: etaOf(next) } : null,
        };
    }

    const { file } = ctx.statement;
    return {
        data: {
            statement: {
                file: file.name,
                kind: file.kind === 'backup' ? 'backup of the expense app' : 'Excel export of the expense app',
                madeAt: file.madeAt,
                firstDate: p.meta.coverage.firstDate,
                lastDate: p.meta.coverage.lastDate,
                operations: p.meta.coverage.records,
            },
            account: ctx.app.signedIn
                ? { signedIn: true, email: ctx.app.email, trips: trips.length, goals: ctx.app.goals?.length ?? 0, categoryLimits: Object.keys(ctx.app.limits).length, milestones: ctx.app.milestones.length }
                : { signedIn: false },
            today: ctx.today,
            baseCurrency: p.meta.baseCurrency,
            ...(ctx.notes.length ? { notes: ctx.notes } : {}),
        },
        netWorth: {
            totalRub: round(ctx.netWorth),
            byCurrency: exposure(ctx.accounts),
            walletsWithBalance: ctx.accounts.filter(a => !a.archived && a.current !== 0).length,
            note: walletSourceNote(ctx),
        },
        thisMonth: {
            note: currentMonth.note,
            month: currentMonth.month,
            dayOfMonth: currentMonth.dayOfMonth,
            daysInMonth: currentMonth.daysInMonth,
            incomeRub: currentMonth.incomeToDate,
            expensesRub: currentMonth.expensesToDate,
            netRub: currentMonth.netToDate,
            savingsRatePct: currentMonth.savingsRateToDatePct,
            prevMonthSameDayExpensesRub: currentMonth.expensesPrevMonthSameDay,
            projectedMonthEndExpensesRub: currentMonth.projectedMonthEndExpenses,
            budgetRub: currentMonth.budgetTotal,
            budgetUsedPct: currentMonth.budgetUsedPct,
            overLimit: budget.rows.filter(r => r.usedThisMonthPct > 100).map(r => ({ category: r.category, limitRub: r.monthlyLimit, spentRub: r.spentThisMonth })),
            topCategories: topOf(currentMonth.month),
        },
        lastCompleteMonth: lastComplete && {
            month: lastComplete.month,
            incomeRub: lastComplete.income,
            expensesRub: lastComplete.expenses,
            netRub: lastComplete.net,
            savingsRatePct: lastComplete.savingsRatePct,
            topCategories: topOf(lastComplete.month),
        },
        recentMonths: {
            columns: ['month', 'incomeRub', 'expensesRub', 'netRub', 'savingsRatePct', 'isPartial'],
            rows: monthly.rows.slice(-7).map(m => [m.month, m.income, m.expenses, m.net, m.savingsRatePct, m.isPartial]),
        },
        averages: monthly.averages,
        recurring: {
            activeMonthlyCostRub: recurring.detected.activeMonthlyCostInBase,
            stillDueThisMonthRub: recurring.detected.dueBeforeMonthEndInBase,
            active: recurring.detected.active.length,
            missed: recurring.detected.missed.map(r => r.name),
        },
        trips: trips.length ? { ongoing: withStatus('ongoing').map(summarize), upcoming: withStatus('upcoming').map(summarize), last: lastTrip } : null,
        goals,
        next: 'list_categories for exact names · query_transactions for any slice · get_analytics for the app\'s reports · get_wallets · get_trips · get_goals',
    };
}
