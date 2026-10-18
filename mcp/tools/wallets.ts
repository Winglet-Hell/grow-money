import { exposureLabel } from '../../src/lib/exposure';
import { daysInMonth, shiftMonthKey } from '../../src/lib/periods';
import { netWorthHistory, type Context } from '../context';
import { exposure, pct, round, roundNative, table } from './common';

// The Wallets page: every wallet's balance in its own currency and in rubles, net worth by
// currency, and on request the net worth line the page draws from the backup's balance history.

export type HistoryMode = 'none' | 'monthly' | 'weekly';

/** The same day `months` months earlier, kept inside that month. */
const monthsBefore = (day: string, months: number) => {
    const month = shiftMonthKey(day.slice(0, 7), -months);
    return `${month}-${String(Math.min(Number(day.slice(8, 10)), daysInMonth(month))).padStart(2, '0')}`;
};

export function walletSourceNote(ctx: Context): string {
    switch (ctx.walletSource) {
        case 'account': return 'Balances as stored in the Grow Money account (a backup import sets them as the expense app has them; otherwise typed in by hand). Transactions do not move them.';
        case 'backup': return `Not signed in: balances are the backup's own, as of ${ctx.statement.backup!.wallets.asOf.slice(0, 10)}.`;
        case 'none': return 'No balances known: not signed in, and the statement is an Excel export, which has none.';
    }
}

export async function getWallets(ctx: Context, { include_archived = false, history = 'none' }: { include_archived?: boolean; history?: HistoryMode }) {
    const visible = ctx.accounts.filter(a => include_archived || !a.archived);
    const held = visible.filter(a => a.current !== 0);

    const out: Record<string, unknown> = {
        netWorthRub: round(ctx.netWorth),
        note: `${walletSourceNote(ctx)} Values in RUB at ${ctx.rates.isLive ? `market rates of ${ctx.rates.date ?? 'today'}` : 'the app\'s built-in fallback rates (market rates unavailable)'}; archived wallets are not in net worth.`,
        byCurrency: exposure(ctx.accounts),
        wallets: table(
            ['wallet', 'type', 'currency', 'balance', 'rub', 'sharePct', 'balanceDate', 'lastUsed', 'operationsSinceBalance', ...(include_archived ? ['archived'] : [])],
            held.map(a => [
                a.name, a.type, a.currency, roundNative(a.current, a.currency), a.hasRate ? round(a.rubEquivalent) : null,
                a.archived ? null : pct(a.rubEquivalent, ctx.netWorth), a.balance_date?.slice(0, 10) ?? null, a.lastActivity, a.txSinceBalance,
                ...(include_archived ? [a.archived] : []),
            ]),
        ),
        emptyWallets: visible.filter(a => a.current === 0).map(a => a.name),
    };
    const unvalued = held.filter(a => !a.hasRate).map(a => `${a.name} (${a.currency})`);
    if (unvalued.length) out.unvalued = { note: 'No ruble rate is known for these, so they are left out of net worth.', wallets: unvalued };

    if (history !== 'none') {
        const series = await netWorthHistory(ctx);
        if (!series) {
            out.history = 'Only a backup of the expense app carries day-by-day balances, and the newest statement is an Excel export.';
            return out;
        }
        const { points } = series;
        const last = points[points.length - 1];
        const groups = Object.entries(last?.byGroup ?? {}).sort((a, b) => b[1] - a[1]).map(([g]) => g);
        for (const p of points) for (const g of Object.keys(p.byGroup)) if (!groups.includes(g)) groups.push(g);
        const shown = history === 'monthly'
            ? [...new Map(points.map(p => [p.day.slice(0, 7), p])).values()] // each month's last point, as the page's table reads them
            : points;
        const changes = last
            ? [1, 3, 6, 12].flatMap(months => {
                const then = [...points].reverse().find(p => p.day <= monthsBefore(last.day, months));
                return then ? [{ monthsAgo: months, day: then.day, rub: round(then.total), changeRub: round(last.total - then.total), changePct: pct(last.total - then.total, then.total) }] : [];
            })
            : [];
        out.history = {
            note: [
                `Net worth day by day from the backup's wallet balances (balance corrections included), valued at each day's market rate; ${history === 'monthly' ? 'the last point of each month' : 'one point a week'}, RUB.`,
                'It moves with exchange rates as well as with saving: a fall can be a weaker dollar, not spending.',
                ctx.walletSource === 'account' ? 'Its last point uses the backup\'s balances, so it can differ a little from netWorthRub (the account\'s).' : '',
                series.isLoading ? 'Some weeks\' rates are still downloading: those points use the nearest known rate. Ask again in a minute for exact figures.' : '',
                series.unvalued.length ? `Left out for want of any rate: ${series.unvalued.join(', ')}.` : '',
            ].filter(Boolean).join(' '),
            changes,
            ...table([history === 'monthly' ? 'month' : 'day', 'totalRub', ...groups.map(exposureLabel)], shown.map(p => [
                history === 'monthly' ? p.day.slice(0, 7) : p.day, round(p.total), ...groups.map(g => round(p.byGroup[g] ?? 0)),
            ])),
        };
    }
    return out;
}
