import type { Account, WalletSnapshot } from '../src/types';
import { accountStatuses, inferAccountDetails, netWorthOf, withDefaultRates, type AccountStatus } from '../src/lib/accountStatus';
import { buildAIExportPayload, type AIExportPayload } from '../src/lib/aiExport';
import { makeRateLookup, referenceCoverage, type ReferenceRates } from '../src/lib/fxBenchmark';
import { todayKey } from '../src/lib/milestones';
import { netWorthSeries, sampleDays, type NetWorthPoint, type WalletHistory } from '../src/lib/netWorth';
import { loadAppData, type AppData } from './appData';
import { liveRates, referenceRates, type LiveRates } from './rates';
import { loadStatement, type Statement } from './statement';

// Everything one tool call works from, put together the way the app's pages put it together:
// the statement's operations, the account's rows, and the wallets valued at today's rates.

export interface Context {
    now: Date;
    today: string; // "YYYY-MM-DD", this computer's calendar
    statement: Statement;
    app: AppData;
    rates: LiveRates;
    valuation: Record<string, number>; // today's rates over the app's built-in fallbacks, as useAccounts values wallets
    accounts: AccountStatus[];
    netWorth: number;
    walletSource: 'account' | 'backup' | 'none';
    notes: string[]; // what the answer should know about where the numbers come from
}

// Without the account, a backup's own balances are what a fresh import would store.
const walletsFromBackup = (snapshot: WalletSnapshot): Account[] =>
    snapshot.wallets.map(w => ({
        id: '',
        name: w.name,
        currency: w.currency,
        balance: w.balance,
        type: inferAccountDetails(w.name, w.currency).type ?? 'cash',
        balance_date: snapshot.asOf,
        is_hidden: w.archived,
    }));

const DAY_MS = 86_400_000;

export async function loadContext(): Promise<Context> {
    const [statement, app, rates] = await Promise.all([loadStatement(), loadAppData(), liveRates()]);
    const now = new Date();
    const today = todayKey(now);
    const valuation = withDefaultRates(rates.rates);

    let stored: Account[] = [];
    let walletSource: Context['walletSource'] = 'none';
    if (app.accounts) {
        stored = app.accounts;
        walletSource = 'account';
    } else if (statement.backup) {
        stored = walletsFromBackup(statement.backup.wallets);
        walletSource = 'backup';
    }
    const accounts = accountStatuses(stored, statement.transactions, valuation);

    const notes: string[] = [];
    if (app.problem) notes.push(app.problem);
    const lastDay = statement.transactions.reduce((max, t) => (t.date > max ? t.date : max), '');
    const behind = lastDay ? Math.round((Date.parse(today) - Date.parse(lastDay.slice(0, 10))) / DAY_MS) : 0;
    if (behind > 2) {
        notes.push(`The newest operation is from ${lastDay.slice(0, 10)}, ${behind} days ago: the statement (${statement.file.name}) is older than the expense app. For current numbers, make a new backup in the app and save it to the same folder.`);
    }
    if (!rates.isLive) notes.push('Market rates could not be downloaded: wallets in other currencies are valued at the app\'s built-in fallback rates and are approximate.');
    if (walletSource === 'backup') notes.push(`Wallet balances are the backup's own (as of ${statement.backup!.wallets.asOf.slice(0, 10)}), not the account's.`);

    return { now, today, statement, app, rates, valuation, accounts, netWorth: netWorthOf(accounts), walletSource, notes };
}

// ------------------------------------------------------------------ the analyst export

const payloads = new WeakMap<Context, Map<ReferenceRates | undefined, AIExportPayload>>();

/**
 * The AI Analyst Export the app builds, from the same inputs AIExportPage hands it. The market
 * rates for every exchange are only fetched for the parts that use them (fx, data quality).
 */
export function analystPayload(ctx: Context, reference?: ReferenceRates): AIExportPayload {
    let byReference = payloads.get(ctx);
    if (!byReference) payloads.set(ctx, (byReference = new Map()));
    const cached = byReference.get(reference);
    if (cached) return cached;
    const payload = buildAIExportPayload({
        transactions: ctx.statement.transactions,
        accounts: ctx.accounts.filter(a => !a.archived).map(a => ({
            name: a.name,
            type: a.type,
            currency: a.currency,
            balance: a.current,
            rubEquivalent: a.rubEquivalent,
            balanceDate: a.balance_date,
            operationsSinceBalance: a.txSinceBalance,
            lastActivity: a.lastActivity,
        })),
        netWorth: ctx.netWorth,
        liveRates: { rates: ctx.valuation, date: null, isLive: ctx.rates.isLive },
        referenceRates: reference,
        trips: ctx.app.trips,
        paycheck: ctx.app.preferences.paycheck,
        categoryLimits: ctx.app.limits,
        recurringHiddenIds: ctx.app.preferences.recurring?.hiddenIds,
        milestones: ctx.app.milestones,
        now: ctx.now,
    });
    byReference.set(reference, payload);
    return payload;
}

/** The market rates of every exchange day, which fx.marketBenchmark needs. */
export function exchangeRates(ctx: Context): Promise<ReferenceRates> {
    return referenceRates(referenceCoverage(ctx.statement.transactions).dates);
}

// ------------------------------------------------------------------ net worth over time

export interface NetWorthHistory {
    points: NetWorthPoint[]; // weekly, as the Wallets chart draws them
    unvalued: string[];      // currencies with no rate on any day
    isLoading: boolean;      // some weeks' rates are still downloading
    asOf: string;
}

/** The Wallets page's net worth line: every wallet's day-by-day balance from the backup, weekly, at that week's rates. */
export async function netWorthHistory(ctx: Context): Promise<NetWorthHistory | null> {
    const snapshot = ctx.statement.backup?.wallets;
    if (!snapshot) return null;
    const history: WalletHistory = {
        asOf: snapshot.asOf,
        wallets: snapshot.wallets.map(({ name, currency, archived, history }) => ({ name, currency, archived, history })),
    };
    const lastDay = history.asOf.slice(0, 10);
    const firstDay = history.wallets.map(w => w.history[0]?.[0]).filter(Boolean).sort()[0];
    if (!firstDay) return null;
    const days = sampleDays(firstDay, lastDay);
    const reference = await referenceRates(days);
    // Today's rates for days the feed has not published, the same fallback-filled ones the wallets get.
    const rateOn = makeRateLookup(reference.snapshots, { rates: ctx.valuation, date: null });
    const { points, unvalued } = netWorthSeries(history, days, rateOn);
    return { points, unvalued, isLoading: reference.isLoading, asOf: history.asOf };
}
