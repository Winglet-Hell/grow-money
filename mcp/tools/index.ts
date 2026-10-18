import * as z from 'zod';
import type { Context } from '../context';
import { getAnalytics, SECTION_HELP, SECTIONS } from './analytics';
import { listCategories } from './catalog';
import { getGoals, type PaceWindow } from './goals';
import { getOverview } from './overview';
import { DIMENSIONS, queryTransactions, type QueryArgs } from './transactions';
import { getTrips } from './trips';
import { getWallets, type HistoryMode } from './wallets';

// Every tool the server offers: its name, what the model is told about it, its arguments, and what
// it runs. The MCP server registers these; `node mcp/run.mjs call <tool>` runs them from a terminal.

export interface Tool {
    name: string;
    title: string;
    description: string;
    // A zod object's shape; the SDK turns it into the JSON schema the client sees.
    inputSchema: z.ZodRawShape;
    run: (ctx: Context, args: Record<string, unknown>) => unknown | Promise<unknown>;
}

const day = (what: string) => z.string().describe(`${what}, "YYYY-MM-DD", inclusive.`);
const names = (what: string) => z.array(z.string()).optional().describe(what);

export const TOOLS: Tool[] = [
    {
        name: 'get_overview',
        title: 'Financial overview',
        description: 'Start here. A snapshot of the user\'s finances in the Grow Money app: which file the data comes from and how fresh it is, net worth by currency, the running month so far (against last month on the same day, with a month-end projection and the budget), the last complete month, recent months, averages, recurring payments, trips and the next goal. Amounts in RUB.',
        inputSchema: {},
        run: ctx => getOverview(ctx),
    },
    {
        name: 'list_categories',
        title: 'Categories, wallets and tags',
        description: 'The exact names the data uses: expense and income categories (with their group, totals, monthly average and budget limit), wallets, the most used tags (merchants and places), the currencies spending happens in, and the trips. Look here before filtering query_transactions by name.',
        inputSchema: {},
        run: ctx => listCategories(ctx),
    },
    {
        name: 'query_transactions',
        title: 'Search and total operations',
        description: [
            'Filter, total and group the user\'s operations: every expense, income and transfer in the expense app\'s statement.',
            'Without group_by it lists the matching rows, newest first (largest first with sort "amount"); with group_by it gives totals per group, e.g. per month, per category, or per month and category.',
            'Amounts: rub is in rubles, the base currency (expenses as positive numbers); amount + currency is what was really paid, in the wallet\'s own currency.',
            'Transfers move money between the user\'s own wallets: they are never income or spending and only show with type "transfer" or "all".',
            'For "how much did I spend on X in Y" use type "expense" with categories/tags/search and month or from/to; for trends use group_by ["month"].',
        ].join(' '),
        inputSchema: {
            type: z.enum(['expense', 'income', 'transfer', 'all']).optional().describe('Which operations. Default "expense".'),
            month: z.string().optional().describe('One calendar month, "YYYY-MM". Takes the place of from/to.'),
            from: day('First day').optional(),
            to: day('Last day').optional(),
            categories: names('Category names, as list_categories gives them; case does not matter.'),
            groups: names('Category groups: Housing, Food & Dining, Travel, Shopping, Entertainment, Transport, Obligations, Health, Other, Income.'),
            accounts: names('Wallet names; a transfer matches on either side.'),
            currencies: names('The currency the wallet was charged in, e.g. THB, USDT, RUB.'),
            tags: names('Exact tags (the merchant or place), matching any of them.'),
            search: z.string().optional().describe('Text to look for in tags and notes, e.g. "grab" or "iphone".'),
            min_rub: z.number().optional().describe('Only operations of at least this many rubles.'),
            max_rub: z.number().optional().describe('Only operations of at most this many rubles.'),
            trip: z.string().optional().describe('A trip\'s name or part of it: only what that trip counts (bookings paid ahead included, a shared payment at the trip\'s part).'),
            exclude_planned: z.boolean().optional().describe('Leave out big planned payments (rent, flights and hotels, travel packages, electronics, visas, insurance, taxes) to see everyday spending.'),
            group_by: z.array(z.enum(DIMENSIONS)).max(2).optional().describe('Up to two of: category, group, payee (the first tag, else the note), tag, account, currency, month, week, day, weekday, year, type.'),
            sort: z.enum(['date', 'amount']).optional().describe('Row order without group_by: newest first (default) or largest first.'),
            limit: z.number().int().min(1).max(500).optional().describe('How many rows or groups to return. Default 50.'),
        },
        run: (ctx, args) => queryTransactions(ctx, args as QueryArgs),
    },
    {
        name: 'get_analytics',
        title: 'Reports from the app',
        description: `The app's own precomputed reports (its AI Analyst Export), with notes on how to read each figure. Ask for one or more sections: ${SECTIONS.map(s => `${s} — ${SECTION_HELP[s]}`).join('; ')}.`,
        inputSchema: {
            sections: z.array(z.enum(SECTIONS)).min(1).describe('The sections to return.'),
        },
        run: (ctx, args) => getAnalytics(ctx, args.sections as (typeof SECTIONS)[number][]),
    },
    {
        name: 'get_wallets',
        title: 'Wallets and net worth',
        description: 'The Wallets page: each wallet\'s balance in its own currency and in rubles, net worth and its split by currency. With history "monthly" or "weekly" it adds the net worth over time (from the backup\'s day-by-day balances) and how it changed over 1, 3, 6 and 12 months.',
        inputSchema: {
            history: z.enum(['none', 'monthly', 'weekly']).optional().describe('Net worth over time. Default "none".'),
            include_archived: z.boolean().optional().describe('Also list wallets archived in the expense app (never part of net worth).'),
        },
        run: (ctx, args) => getWallets(ctx, args as { history?: HistoryMode; include_archived?: boolean }),
    },
    {
        name: 'get_trips',
        title: 'Trips',
        description: 'Trip Analytics. Without trip: every trip with its cost, cost per day, budget and extra cost against life at home, the totals per year, and trips the app spotted that the user never recorded. With trip (a name or part of it): that trip by category and by day, the payments it counts, what it leaves out, and travel payments around it that may be missing.',
        inputSchema: {
            trip: z.string().optional().describe('A trip\'s name or part of it. Leave out to list them all.'),
        },
        run: (ctx, args) => getTrips(ctx, args as { trip?: string }),
    },
    {
        name: 'get_goals',
        title: 'Goals',
        description: 'The Goals page: the open goals funded from the net worth in turn (High priority first), how far along each is, and when saving at the user\'s pace reaches it; plus the goals already reached.',
        inputSchema: {
            pace_months: z.union([z.literal(3), z.literal(6), z.literal(12)]).optional().describe('Months the saving pace averages over: 3, 6 (default) or 12.'),
        },
        run: (ctx, args) => getGoals(ctx, args as { pace_months?: PaceWindow }),
    },
];
