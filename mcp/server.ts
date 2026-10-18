import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod';
import { exchangeRates, loadContext, netWorthHistory, type Context } from './context';
import { formatJson } from './format';
import { FINANCIAL_REVIEW, monthReview } from './prompts';
import { TOOLS, type Tool } from './tools';
import { tabulate } from './tools/analytics';

// The Grow Money MCP server: a local, read-only window onto the user's finances for Claude (or
// any MCP client). It runs on this computer over stdio, started by the client.

export const SERVER_VERSION = '1.0.0';

const INSTRUCTIONS = [
    'Grow Money is the user\'s personal finance app. These tools read their data and change nothing:',
    'the operations come from the newest backup or Excel export of their expense app (the file they import into Grow Money), and wallet balances, trips, goals, category budgets and life milestones from their Grow Money account.',
    'Amounts are in RUB, the base currency, unless a field names another currency; expenses are positive numbers.',
    'Transfers move money between the user\'s own wallets: never count them as spending or income.',
    'The running month is incomplete: compare it with the previous month on the same day or with the projection, never with whole months.',
    'Start with get_overview (it also tells how fresh the data is). Use list_categories for exact names before filtering; query_transactions answers "how much, on what, when"; get_analytics holds the app\'s own reports — read the note fields there before interpreting figures.',
    'Lists of three or more records come as columns + rows: rows[i][j] is the value of columns[j].',
    'When a number depends on the period or on the data file, say which.',
].join(' ');

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

let warmed = false;
// After the first call, fetch in the background what the slower answers need (the market rate of
// every exchange day and of every week since the first balance), so they come back quickly.
function warmUp(ctx: Context) {
    if (warmed) return;
    warmed = true;
    void exchangeRates(ctx).catch(() => undefined);
    void netWorthHistory(ctx).catch(() => undefined);
}

const text = (value: string, isError = false): CallToolResult => ({ content: [{ type: 'text', text: value }], ...(isError ? { isError } : {}) });

export async function runTool(tool: Tool, args: Record<string, unknown>): Promise<CallToolResult> {
    try {
        const ctx = await loadContext();
        warmUp(ctx);
        return text(formatJson(tabulate(await tool.run(ctx, args))));
    } catch (e) {
        return text(e instanceof Error ? e.message : String(e), true);
    }
}

export function createServer(): McpServer {
    const server = new McpServer(
        { name: 'grow-money', title: 'Grow Money', version: SERVER_VERSION },
        { instructions: INSTRUCTIONS },
    );

    for (const tool of TOOLS) {
        server.registerTool(
            tool.name,
            { title: tool.title, description: tool.description, inputSchema: tool.inputSchema, annotations: { title: tool.title, ...READ_ONLY } },
            (args: Record<string, unknown>) => runTool(tool, args ?? {}),
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

export async function serve(): Promise<void> {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // The client closing the pipe is the signal to go.
    process.stdin.on('close', () => process.exit(0));
}
