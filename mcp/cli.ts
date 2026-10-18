import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { loadAppData } from './appData';
import { loadContext } from './context';
import { formatJson } from './format';
import { HOME_DIR, LOGIN_COMMAND, SESSION_FILE, STATEMENT_DIRS, STATEMENT_FILE, tilde } from './paths';
import { runTool, serve, SERVER_VERSION } from './server';
import { readSession, signIn, signOut } from './session';
import { findStatements } from './statement';
import { TOOLS } from './tools';

// `node mcp/run.mjs [command]`: the server itself (what Claude starts), and the few things a person
// does by hand — signing in and out, checking what the server sees, trying a tool.

const HELP = `Grow Money MCP server ${SERVER_VERSION}

  node mcp/run.mjs            run the server over stdio (what Claude starts)
  node mcp/run.mjs login      sign in to Grow Money once, so wallets, trips and goals can be read
  node mcp/run.mjs logout     sign out and forget the saved session
  node mcp/run.mjs status     what the server sees: the statement file, the account, net worth
  node mcp/run.mjs call <tool> ['{"json":"args"}']   run one tool and print its answer

Tools: ${TOOLS.map(t => t.name).join(', ')}
`;

async function readHidden(prompt: string): Promise<string> {
    const { stdin, stdout } = process;
    stdout.write(prompt);
    if (!stdin.isTTY) {
        // Piped in: the next line is the password.
        const rl = readline.createInterface({ input: stdin, terminal: false });
        const line = await new Promise<string>(resolve => rl.once('line', resolve));
        rl.close();
        return line;
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    return new Promise((resolve, reject) => {
        let value = '';
        const done = (error?: Error) => {
            stdin.off('data', onData);
            stdin.setRawMode(false);
            stdin.pause();
            stdout.write('\n');
            if (error) reject(error); else resolve(value);
        };
        const onData = (chunk: string) => {
            for (const ch of chunk) {
                if (ch === '\r' || ch === '\n') return done();
                if (ch === '\u0003') return done(new Error('Cancelled.'));
                if (ch === '\u007f' || ch === '\b') {
                    if (value) {
                        value = value.slice(0, -1);
                        stdout.write('\b \b');
                    }
                    continue;
                }
                if (ch >= ' ') {
                    value += ch;
                    stdout.write('•');
                }
            }
        };
        stdin.on('data', onData);
    });
}

async function login() {
    console.log('Sign in with your Grow Money email and password. The password is sent to Supabase once and is not saved;');
    console.log(`the server keeps only a session token in ${tilde(SESSION_FILE)}, readable by you alone.\n`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const email = (await rl.question('Email: ')).trim();
    rl.close();
    if (!email) throw new Error('No email given.');
    const password = await readHidden('Password: ');
    if (!password) throw new Error('No password given.');
    const session = await signIn(email, password);
    console.log(`\nSigned in as ${session.user.email ?? email}. Claude can now see your wallets, trips, goals, limits and milestones.`);
}

async function logout() {
    const was = await signOut();
    console.log(was ? 'Signed out: the session is closed and its token deleted.' : 'Not signed in.');
}

const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;

async function claudeDesktopHasServer(): Promise<boolean | null> {
    const file = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    try {
        const config = JSON.parse(await fs.readFile(file, 'utf8'));
        return !!config?.mcpServers?.['grow-money'];
    } catch {
        return null;
    }
}

async function status() {
    console.log(`Grow Money MCP server ${SERVER_VERSION}\n`);
    const { files, unreadable } = await findStatements();
    console.log(`Statements: looking in ${STATEMENT_FILE ? tilde(STATEMENT_FILE) : STATEMENT_DIRS.map(tilde).join(', ')}`);
    if (unreadable.length) console.log(`  can't read ${unreadable.map(tilde).join(', ')} (macOS privacy settings?)`);
    if (!files.length) console.log('  no backup (.mmbackup) or Excel export of the expense app found');
    for (const f of files.slice(0, 3)) console.log(`  ${f === files[0] ? '→' : ' '} ${f.name} (${f.kind}${f.madeAt ? `, made ${f.madeAt}` : ''})`);
    if (files.length > 3) console.log(`    …and ${files.length - 3} older`);

    const session = await readSession();
    const app = await loadAppData();
    console.log(`\nAccount: ${session ? `signed in as ${session.user.email}` : 'not signed in'}`);
    if (app.problem) console.log(`  ${app.problem}`);
    if (app.signedIn) {
        console.log(`  ${app.accounts?.length ?? 0} wallets, ${app.trips.length} trips, ${app.goals?.length ?? 0} goals, ${Object.keys(app.limits).length} limits, ${app.milestones.length} milestones`);
    }

    if (files.length) {
        try {
            const ctx = await loadContext();
            const dates = ctx.statement.transactions.map(t => t.date).sort();
            console.log(`\nData: ${ctx.statement.transactions.length} operations, ${dates[0]} → ${dates[dates.length - 1]}`);
            console.log(`  net worth ${rub(ctx.netWorth)} (${ctx.walletSource === 'account' ? 'account balances' : ctx.walletSource === 'backup' ? 'the backup\'s balances' : 'no balances'}, ${ctx.rates.isLive ? `rates of ${ctx.rates.date ?? 'today'}` : 'fallback rates'})`);
            for (const note of ctx.notes) if (note !== app.problem) console.log(`  note: ${note}`);
        } catch (e) {
            console.log(`\nData: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    const desktop = await claudeDesktopHasServer();
    console.log(`\nClaude Desktop: ${desktop === null ? 'no config found' : desktop ? 'grow-money is in its config' : 'grow-money is not in its config'}`);
    console.log(`Kept in ${tilde(HOME_DIR)}${session ? '' : `\nTo sign in: ${LOGIN_COMMAND}`}`);
}

async function call(name: string | undefined, json: string | undefined) {
    const tool = TOOLS.find(t => t.name === name);
    if (!tool) throw new Error(`Unknown tool "${name ?? ''}". Tools: ${TOOLS.map(t => t.name).join(', ')}.`);
    const args = json ? JSON.parse(json) : {};
    const result = await runTool(tool, args);
    const body = result.content.map(c => (c.type === 'text' ? c.text : formatJson(c))).join('\n');
    if (result.isError) throw new Error(body);
    console.log(body);
    // Background downloads started by the call shouldn't keep a one-off run alive.
    process.exit(0);
}

export async function main(argv: string[]): Promise<void> {
    const [command = 'serve', ...rest] = argv;
    try {
        switch (command) {
            case 'serve': return await serve();
            case 'login': return await login();
            case 'logout': return await logout();
            case 'status': return await status();
            case 'call': return await call(rest[0], rest[1]);
            case 'help': case '--help': case '-h': console.log(HELP); return;
            default:
                console.error(`Unknown command "${command}".\n`);
                console.log(HELP);
                process.exitCode = 1;
        }
    } catch (e) {
        console.error(e instanceof Error ? e.message : String(e));
        process.exit(1);
    }
}
