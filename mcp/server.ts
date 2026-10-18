import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod';
import type { Context } from './context';
import { formatJson } from './format';
import { FINANCIAL_REVIEW, monthReview } from './prompts';
import { TOOLS, type Tool } from './tools';
import { tabulate } from './tools/analytics';

// The Grow Money MCP server: a read-only window onto the user's finances for Claude, ChatGPT or any
// MCP client. The same tools run in two places: on this computer over stdio (local.ts), and online
// as a Supabase Edge Function for the phone and ChatGPT (remote.ts). Only where the data comes
// from differs, so the server is given a way to load it.

export const SERVER_VERSION = '1.1.0';

export interface ServerOptions {
    load: () => Promise<Context>;          // the data one call works from
    source: 'downloads' | 'account';       // where the operations come from, for the instructions
    afterLoad?: (ctx: Context) => void;    // a hook after the data is in, e.g. to fetch rates ahead
}

const instructions = (source: ServerOptions['source']) => [
    'Grow Money is the user\'s personal finance app. These tools read their data and change nothing:',
    source === 'downloads'
        ? 'the operations come from the newest backup or Excel export of their expense app (the file they import into Grow Money),'
        : 'the operations come from the statement the user last imported into Grow Money (a backup or Excel export of their expense app),',
    'and wallet balances, trips, goals, category budgets and life milestones from their Grow Money account.',
    'Amounts are in RUB, the base currency, unless a field names another currency; expenses are positive numbers.',
    'Transfers move money between the user\'s own wallets: never count them as spending or income.',
    'The running month is incomplete: compare it with the previous month on the same day or with the projection, never with whole months.',
    'Start with get_overview (it also tells how fresh the data is). Use list_categories for exact names before filtering; query_transactions answers "how much, on what, when"; get_analytics holds the app\'s own reports — read the note fields there before interpreting figures.',
    'Lists of three or more records come as columns + rows: rows[i][j] is the value of columns[j].',
    'When a number depends on the period or on the data file, say which.',
].join(' ');

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const text = (value: string, isError = false): CallToolResult => ({ content: [{ type: 'text', text: value }], ...(isError ? { isError } : {}) });

export async function runTool(tool: Tool, args: Record<string, unknown>, options: Pick<ServerOptions, 'load' | 'afterLoad'>): Promise<CallToolResult> {
    try {
        const ctx = await options.load();
        options.afterLoad?.(ctx);
        return text(formatJson(tabulate(await tool.run(ctx, args))));
    } catch (e) {
        return text(e instanceof Error ? e.message : String(e), true);
    }
}

export function createServer(options: ServerOptions): McpServer {
    const server = new McpServer(
        { name: 'grow-money', title: 'Grow Money', version: SERVER_VERSION },
        { instructions: instructions(options.source) },
    );

    for (const tool of TOOLS) {
        server.registerTool(
            tool.name,
            { title: tool.title, description: tool.description, inputSchema: tool.inputSchema, annotations: { title: tool.title, ...READ_ONLY } },
            (args: Record<string, unknown>) => runTool(tool, args ?? {}, options),
        );
    }

    server.registerPrompt(
        'financial_review',
        {
            title: 'Full financial review',
            description: 'The AI Export page\'s analyst brief: verdict, leaks, savings, conversions, forecast, capital and data quality — fetched through the tools.',
        },
        () => ({ messages: [{ role: 'user', content: { type: 'text', text: FINANCIAL_REVIEW } }] }),
    );
    server.registerPrompt(
        'month_review',
        {
            title: 'Review a month',
            description: 'How a month went: totals against the usual, overspending, big purchases, what is still due.',
            argsSchema: { month: z.string().optional().describe('"YYYY-MM"; the running month when left out.') },
        },
        ({ month }) => ({ messages: [{ role: 'user', content: { type: 'text', text: monthReview(month?.trim() || undefined) } }] }),
    );

    return server;
}
