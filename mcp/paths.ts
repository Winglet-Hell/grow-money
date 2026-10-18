import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Where the server keeps what it needs between runs, and where it looks for statements. Each
// can be moved with an environment variable in the MCP client's config.

const expandHome = (p: string) => p.replace(/^~(?=$|\/)/, os.homedir());

/** The sign-in session and the rate cache: ~/.grow-money, unless GROW_MONEY_HOME names another folder. */
export const HOME_DIR = expandHome(process.env.GROW_MONEY_HOME || path.join(os.homedir(), '.grow-money'));
export const SESSION_FILE = path.join(HOME_DIR, 'session.json');
export const RATES_DIR = path.join(HOME_DIR, 'rates');

/** Folders searched for the expense app's backups and exports: ~/Downloads, unless GROW_MONEY_STATEMENT_DIR lists others. */
export const STATEMENT_DIRS = (process.env.GROW_MONEY_STATEMENT_DIR || path.join(os.homedir(), 'Downloads'))
    .split(path.delimiter)
    .map(dir => dir.trim())
    .filter(Boolean)
    .map(expandHome);

/** One exact file to read instead of the newest one in those folders. */
export const STATEMENT_FILE = process.env.GROW_MONEY_STATEMENT ? expandHome(process.env.GROW_MONEY_STATEMENT) : null;

/** "~/Downloads" rather than "/Users/name/Downloads", for messages. */
export const tilde = (p: string) => (p.startsWith(os.homedir()) ? `~${p.slice(os.homedir().length)}` : p);

/** The command that signs the server in, runnable from any folder (a quoted "~" would not expand). */
export const LOGIN_COMMAND = `node "${path.join(path.dirname(fileURLToPath(import.meta.url)), 'run.mjs')}" login`;
