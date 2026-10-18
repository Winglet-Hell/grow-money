import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { readBackup } from '../src/lib/backup';
import { parseExcelStatement } from '../src/lib/excelStatement';
import { STATEMENT_DIRS, STATEMENT_FILE, tilde } from './paths';
import { madeAtOf, type Statement, type StatementFile } from './statementFile';

export type { Statement, StatementFile } from './statementFile';

// The operations come from the expense app's own files, the ones imported into the web app: the
// newest backup (.mmbackup) or Excel export in ~/Downloads. They go through the app's own readers,
// so they are the very transactions the app shows after importing the same file.

/** Nothing to read: no file, or a folder macOS keeps closed. */
export class NoStatement extends Error {}

function describe(filePath: string, stat: { mtime: Date; size: number }, explicit = false): StatementFile | null {
    const name = path.basename(filePath);
    const ext = path.extname(name).toLowerCase();
    const madeAt = madeAtOf(name);
    // Every backup is the app's; an .xlsx only when named the app's way, since Downloads holds others.
    const kind = ext === '.mmbackup' ? 'backup' : ext === '.xlsx' && (madeAt || explicit) ? 'excel' : null;
    if (!kind) return null;
    return {
        path: filePath,
        name,
        kind,
        madeAt,
        modified: stat.mtime.toISOString(),
        size: stat.size,
        storedIn: 'downloads',
    };
}

const sortKey = (f: StatementFile) => (f.madeAt ? f.madeAt.replace(' ', 'T') : f.modified.slice(0, 16));

/** The app's files in the statement folders, newest first, and the folders that couldn't be read. */
export async function findStatements(): Promise<{ files: StatementFile[]; unreadable: string[] }> {
    if (STATEMENT_FILE) {
        const stat = await fs.stat(STATEMENT_FILE).catch(() => null);
        const file = stat && describe(STATEMENT_FILE, stat, true);
        return { files: file ? [file] : [], unreadable: stat ? [] : [STATEMENT_FILE] };
    }
    const files: StatementFile[] = [];
    const unreadable: string[] = [];
    for (const dir of STATEMENT_DIRS) {
        let names: string[];
        try {
            names = await fs.readdir(dir);
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT') unreadable.push(dir);
            continue;
        }
        for (const name of names) {
            if (!/\.(mmbackup|xlsx)$/i.test(name)) continue;
            const full = path.join(dir, name);
            const stat = await fs.stat(full).catch(() => null);
            const file = stat?.isFile() ? describe(full, stat) : null;
            if (file) files.push(file);
        }
    }
    files.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
    return { files, unreadable };
}

let sql: Promise<SqlJsStatic> | null = null;
const sqlJs = () => {
    if (!sql) {
        const require = createRequire(import.meta.url);
        sql = initSqlJs({ locateFile: (file: string) => require.resolve(`sql.js/dist/${file}`) });
    }
    return sql;
};

async function readStatement(file: StatementFile): Promise<Statement> {
    const bytes = await fs.readFile(file.path);
    const data = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let statement: Statement;
    if (file.kind === 'backup') {
        const { transactions, wallets, categories } = readBackup(data, await sqlJs());
        statement = { file, transactions, backup: { wallets, categories } };
    } else {
        statement = { file, transactions: await parseExcelStatement(data.slice().buffer) };
    }
    // Newest first, the order App.applyImport stores them in.
    statement.transactions.sort((a, b) => (a.date !== b.date ? b.date.localeCompare(a.date) : (a.index || 0) - (b.index || 0)));
    return statement;
}

let current: { key: string; statement: Statement } | null = null;
let reading: { key: string; promise: Promise<Statement> } | null = null;

/** The newest statement, read again only when a newer file turns up or this one changes. */
export async function loadStatement(): Promise<Statement> {
    const { files, unreadable } = await findStatements();
    const file = files[0];
    if (!file) {
        const where = STATEMENT_FILE ? tilde(STATEMENT_FILE) : STATEMENT_DIRS.map(tilde).join(', ');
        if (unreadable.length) {
            throw new NoStatement(`macOS didn't let the server read ${unreadable.map(tilde).join(', ')}. Allow access to that folder for the app running the server (System Settings → Privacy & Security → Files and Folders), or put the backup in another folder and name it in GROW_MONEY_STATEMENT_DIR.`);
        }
        throw new NoStatement(`No backup (.mmbackup) or Excel export of the expense app in ${where}. Make a backup in the expense app and save it there.`);
    }
    const key = `${file.path}|${file.modified}|${file.size}`;
    if (current?.key === key) return current.statement;
    if (reading?.key === key) return reading.promise;
    const promise = readStatement(file).then(
        statement => {
            current = { key, statement };
            return statement;
        },
        (e: unknown) => {
            throw new NoStatement(`Couldn't read ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
        },
    ).finally(() => {
        if (reading?.key === key) reading = null;
    });
    reading = { key, promise };
    return promise;
}
