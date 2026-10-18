import fs from 'node:fs/promises';
import path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { noAppData, readAppData, type AppData } from './appData';
import { buildContext, exchangeRates, netWorthHistory, type Context } from './context';
import { LOGIN_COMMAND, RATES_DIR } from './paths';
import { liveRates, setRateStore } from './rates';
import { createServer } from './server';
import { currentSession, SignInNeeded } from './session';
import { loadStatement } from './statement';

// The server as Claude Desktop and Claude Code run it on this computer: the operations from the
// newest file in ~/Downloads, the account through the session `login` saved, and day rates kept on
// disk between runs.

const fileOf = (date: string) => path.join(RATES_DIR, `${date}.json`);
setRateStore({
    async read(date) {
        try {
            const parsed = JSON.parse(await fs.readFile(fileOf(date), 'utf8'));
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch {
            return null;
        }
    },
    async write(date, rates) {
        await fs.mkdir(RATES_DIR, { recursive: true });
        const tmp = `${fileOf(date)}.${process.pid}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(rates));
        await fs.rename(tmp, fileOf(date));
    },
});

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Kept for a minute, so one answer's several calls share the account's rows.
const FRESH_MS = 60_000;
let cache: AppData | null = null;
let inflight: Promise<AppData> | null = null;

async function readAccount(): Promise<AppData> {
    let session;
    try {
        session = await currentSession();
    } catch (e) {
        return noAppData(e instanceof SignInNeeded ? e.message : `Couldn't reach the Grow Money account: ${messageOf(e)}`);
    }
    if (!session) {
        return noAppData(`Not signed in to Grow Money, so wallets come from the backup and there are no trips, goals, limits or milestones. Run \`${LOGIN_COMMAND}\` in a terminal once to add them.`);
    }
    return readAppData(session);
}

export async function loadAppData(): Promise<AppData> {
    if (cache && Date.now() - cache.loadedAt < FRESH_MS) return cache;
    if (!inflight) {
        inflight = readAccount()
            .then(data => (cache = data))
            .finally(() => { inflight = null; });
    }
    return inflight;
}

export async function loadLocalContext(): Promise<Context> {
    const [statement, app, rates] = await Promise.all([loadStatement(), loadAppData(), liveRates()]);
    return buildContext(statement, app, rates);
}

let warmed = false;
// After the first call, fetch in the background what the slower answers need (the market rate of
// every exchange day and of every week since the first balance), so they come back quickly.
function warmUp(ctx: Context) {
    if (warmed) return;
    warmed = true;
    void exchangeRates(ctx).catch(() => undefined);
    void netWorthHistory(ctx).catch(() => undefined);
}

export const LOCAL_SERVER = { load: loadLocalContext, source: 'downloads', afterLoad: warmUp } as const;

export async function serve(): Promise<void> {
    const server = createServer(LOCAL_SERVER);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // The client closing the pipe is the signal to go.
    process.stdin.on('close', () => process.exit(0));
}
