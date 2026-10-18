import { formatSpan, monthsLabel, netWorthGrowth, planGoals, savingPace, type Goal, type GoalPlan } from '../../src/lib/goals';
import { netWorthHistory, type Context } from '../context';
import { pct, round, table } from './common';

// The Goals page: the open goals funded from the net worth in turn (High priority first, the
// cheaper first within one), each dated by when saving at the chosen pace covers it.

export type PaceWindow = 3 | 6 | 12;

export function goalPlans(ctx: Context, window: PaceWindow = 6) {
    const goals = ctx.app.goals ?? [];
    const pace = savingPace(ctx.statement.transactions, window, ctx.now);
    // Rubles per unit of a goal's currency, from the rates the wallets are valued at.
    const rubOf = (goal: Goal) => {
        if (goal.currency === 'RUB') return goal.price;
        const rate = ctx.valuation[goal.currency];
        return typeof rate === 'number' && rate > 0 ? goal.price * rate : null;
    };
    const open = goals.filter(g => !g.reachedOn);
    const reached = goals.filter(g => g.reachedOn).sort((a, b) => b.reachedOn!.localeCompare(a.reachedOn!));
    return { pace, plans: planGoals(open, ctx.netWorth, pace?.perMonth ?? null, rubOf, ctx.today), reached };
}

export const etaOf = (p: GoalPlan) =>
    p.reachedNow ? 'covered now' : p.monthsAway === null ? (p.costRub === null ? 'no rate for its currency' : 'not at this pace') : formatSpan(p.monthsAway);

export async function getGoals(ctx: Context, { pace_months = 6 }: { pace_months?: PaceWindow }) {
    if (!ctx.app.goals) {
        throw new Error(`Goals live in the Grow Money account, which the server can't read: ${ctx.app.problem ?? 'not signed in.'}`);
    }
    const { pace, plans, reached } = goalPlans(ctx, pace_months);
    const others = ([3, 6, 12] as PaceWindow[]).filter(w => w !== pace_months).map(w => {
        const p = savingPace(ctx.statement.transactions, w, ctx.now);
        return { months: w, perMonthRub: p ? round(p.perMonth) : null, period: p ? monthsLabel(p.months) : null };
    });
    const history = pace ? await netWorthHistory(ctx) : null;
    const growth = pace && history ? netWorthGrowth(history.points, pace.months) : null;
    const valued = plans.filter(p => p.costRub !== null);
    const next = valued.find(p => !p.reachedNow);

    return {
        note: [
            'RUB. The net worth is shared out to the open goals in turn — High priority first, the cheaper goal first within a priority — so no two goals count the same money.',
            'A goal\'s date is when the net worth, growing by the saving pace (income minus spending, transfers left out, over complete months), covers it together with every goal before it.',
            'netWorthGrowthPerMonthRub is how the net worth actually moved over the same months; it also carries exchange-rate swings and interest, so it can differ from the pace.',
        ].join(' '),
        netWorthRub: round(ctx.netWorth),
        pace: pace ? { months: pace_months, period: monthsLabel(pace.months), perMonthRub: round(pace.perMonth) } : null,
        otherPaces: others,
        netWorthGrowthPerMonthRub: growth === null ? null : round(growth),
        openGoalsRub: round(valued.reduce((s, p) => s + p.costRub!, 0)),
        nextGoal: next ? { name: next.goal.name, eta: next.date, inAbout: etaOf(next) } : null,
        goals: table(
            ['goal', 'icon', 'priority', 'price', 'currency', 'costRub', 'fundedRub', 'fundedPct', 'reachedNow', 'eta', 'inAbout'],
            plans.map(p => [
                p.goal.name, p.goal.icon, p.goal.priority, p.goal.price, p.goal.currency, p.costRub === null ? null : round(p.costRub),
                round(p.funded), p.costRub ? pct(p.funded, p.costRub) : 0, p.reachedNow, p.date, etaOf(p),
            ]),
        ),
        reached: table(['goal', 'reachedOn', 'price', 'currency'], reached.map(g => [g.name, g.reachedOn, g.price, g.currency])),
        ...(ctx.app.goalsNeedMigration ? { warning: 'The goals table lacks the currency and reached-date columns: run supabase_migration_goals.sql in the Supabase SQL editor.' } : {}),
    };
}
