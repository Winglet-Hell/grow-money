import { db } from './db';
import type { Transaction } from '../types';
import { readImportMeta, writeImportMeta, clearImportMeta, type ImportMeta } from './importing';
import { readWalletHistory, writeWalletHistory, clearWalletHistory } from './netWorth';
import { readAppCategories, rememberAppCategories, forgetAppCategories } from './categoryIcons';
import { readCloudHead, downloadStatement, uploadStatement, type CloudHead } from './statementCloud';

// Keeps the statement on this device and the account's copy in line, so every device the user
// signs in on shows the same operations. A statement imported on the laptop reaches the phone the
// next time Grow Money is opened or brought back to the screen there; one imported here goes up at
// once. Each save gives the copy a new version, so a copy saved from another device is never
// overwritten unseen, and an older import never replaces a newer one.

/**
 * Newest first, the order the pages read them in. Transfers count `index` apart from the other
 * operations, so a day can hold two rows of one index; the id puts those in the same order on
 * every device, however the rows were read.
 */
export const newestFirst = (a: Transaction, b: Transaction) =>
    a.date !== b.date ? b.date.localeCompare(a.date)
        : (a.index || 0) - (b.index || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// "Clear data" empties this device on purpose: it stays empty, with the account's copy offered,
// until the user loads that back or imports a statement.
const CLEARED_KEY = 'growmoney:statementCleared';
const isCleared = () => { try { return localStorage.getItem(CLEARED_KEY) === '1'; } catch { return false; } };
const setCleared = (cleared: boolean) => {
    try {
        if (cleared) localStorage.setItem(CLEARED_KEY, '1');
        else localStorage.removeItem(CLEARED_KEY);
    } catch { /* storage blocked */ }
};

// Moves on with every change made to the statement here, so a copy that arrives from the account
// while one was being made is dropped rather than laid over it.
let generation = 0;

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The statement's bookkeeping on this device, when it is this account's (another account's stays out of sight). */
export function deviceMeta(userId: string): ImportMeta | null {
    const meta = readImportMeta();
    return meta && (!meta.userId || meta.userId === userId) ? meta : null;
}

async function replaceOperations(rows: Transaction[]): Promise<void> {
    await db.transaction('rw', db.transactions, async () => {
        await db.transactions.clear();
        await db.transactions.bulkAdd(rows);
    });
}

/** Stores a statement imported here in place of whatever the device held. */
export async function storeStatement(rows: Transaction[], meta: ImportMeta): Promise<void> {
    generation++;
    setCleared(false);
    await replaceOperations(rows);
    writeImportMeta(meta);
}

/** "Clear data": empties this device. The account's copy stays, offered to load back. */
export async function clearDevice(): Promise<void> {
    generation++;
    setCleared(true);
    await db.transactions.clear();
    clearImportMeta();
    clearWalletHistory();
    forgetAppCategories();
}

/** After operations were changed here (a wallet renamed or merged): they go to the account on the next sync. */
export function noteEdited(userId: string): void {
    generation++;
    const meta = deviceMeta(userId);
    // An import not yet in the account stays one: the change rides along with it.
    if (meta) writeImportMeta({ ...meta, userId, unsaved: meta.unsaved === 'import' ? 'import' : 'edit' });
}

// ---------------------------------------------------------------------------
// What to do
// ---------------------------------------------------------------------------

export interface DeviceState {
    meta: ImportMeta | null;   // this account's, or null
    hasData: boolean;          // operations stored here
    cleared: boolean;          // emptied with "Clear data"
}

export type SyncPlan =
    | { action: 'none' }
    | { action: 'adopt'; version: string }    // the same statement on both sides: just note the copy's version
    | { action: 'pull' }
    | { action: 'push'; over: string | null }
    | { action: 'offer' };                    // cleared here on purpose: the copy waits for the user

const sameVersion = (a: string, b: string) => a === b || Date.parse(a) === Date.parse(b);

/**
 * Whether this device's statement or the account's copy should give way. The device matched the
 * copy when its `version` is the copy's: then only a change made here since goes up. A copy saved
 * from elsewhere since comes down, unless this device has an import of its own waiting to go up,
 * where the later import wins. A device from before syncing never matched one: the later import
 * wins, and the same import is just noted.
 */
export function planSync({ meta, hasData, cleared }: DeviceState, head: CloudHead | null): SyncPlan {
    if (!head) return hasData && meta ? { action: 'push', over: null } : { action: 'none' };
    if (!hasData || !meta) return cleared ? { action: 'offer' } : { action: 'pull' };

    const push = { action: 'push', over: head.version } as const;
    const pull = { action: 'pull' } as const;
    const ours = Date.parse(meta.at);
    const theirs = Date.parse(head.importedAt);

    if (meta.version && sameVersion(meta.version, head.version)) return meta.unsaved ? push : { action: 'none' };
    if (meta.version) {
        if (meta.unsaved === 'import') return theirs > ours ? pull : push;
        // A wallet renamed here on the same import as the copy's: this device's names win.
        if (meta.unsaved === 'edit' && theirs === ours) return push;
        return pull;
    }
    if (theirs !== ours) return theirs > ours ? pull : push;
    return meta.unsaved ? push : { action: 'adopt', version: head.version };
}

// ---------------------------------------------------------------------------
// Doing it
// ---------------------------------------------------------------------------

/** Brings the account's copy onto this device; null when a change made here meanwhile wins, or the copy is gone. */
async function pull(userId: string): Promise<{ transactions: Transaction[]; meta: ImportMeta } | null> {
    const started = generation;
    const copy = await downloadStatement(userId);
    if (!copy || generation !== started) return null;
    const rows = [...copy.transactions].sort(newestFirst);
    await replaceOperations(rows);
    // A change made here while they were being written is stored after them, and stays.
    if (generation !== started) return null;
    // Without a backup's balances or categories in the copy, the ones here stay, as after an Excel import.
    if (copy.walletHistory) writeWalletHistory(copy.walletHistory);
    if (copy.appCategories) rememberAppCategories(copy.appCategories);
    const meta: ImportMeta = {
        at: copy.importedAt,
        count: rows.length,
        ...(copy.fileName ? { fileName: copy.fileName } : {}),
        latestDate: copy.latestDate,
        userId,
        version: copy.version,
    };
    writeImportMeta(meta);
    setCleared(false);
    return { transactions: rows, meta };
}

/** Sends this device's statement to the account in place of version `over`; false when the copy had changed meanwhile. */
async function push(userId: string, meta: ImportMeta, over: string | null | 'any', rows?: Transaction[]): Promise<boolean> {
    const started = generation;
    const transactions = rows ?? (await db.transactions.toArray()).sort(newestFirst);
    const version = await uploadStatement(userId, { transactions, meta, walletHistory: readWalletHistory(), appCategories: readAppCategories() }, over);
    if (!version) return false;
    // A change made here while it was on its way stays unsaved, and goes up next time.
    if (generation === started) writeImportMeta({ ...meta, userId, version, unsaved: undefined });
    return true;
}

/** Sends a statement just imported here to the account, in place of whatever it held. */
export async function saveImported(userId: string, rows: Transaction[], meta: ImportMeta): Promise<void> {
    await push(userId, meta, 'any', rows);
}

export type SyncOutcome =
    | { kind: 'same' }                                                  // nothing to bring here
    | { kind: 'pulled'; transactions: Transaction[]; meta: ImportMeta } // the account's copy is now on this device
    | { kind: 'offer'; head: CloudHead; error?: string };               // nothing here; the copy waits to be loaded

async function run(userId: string): Promise<SyncOutcome> {
    // A copy that changes between looking and saving gets another look; three are plenty.
    for (let attempt = 0; attempt < 3; attempt++) {
        const head = await readCloudHead(userId);
        const hasRows = (await db.transactions.count()) > 0;
        const meta = deviceMeta(userId);
        const plan = planSync({ meta, hasData: hasRows && meta !== null, cleared: isCleared() }, head);
        switch (plan.action) {
            case 'none':
                return { kind: 'same' };
            case 'offer':
                return { kind: 'offer', head: head! };
            case 'adopt':
                writeImportMeta({ ...meta!, userId, version: plan.version });
                return { kind: 'same' };
            case 'pull': {
                try {
                    const pulled = await pull(userId);
                    if (pulled) return { kind: 'pulled', ...pulled };
                } catch (e) {
                    // With nothing here to show, the copy is offered with what went wrong.
                    if (!meta || !hasRows) return { kind: 'offer', head: head!, error: messageOf(e) };
                    throw e;
                }
                break;
            }
            case 'push':
                if (await push(userId, meta!, plan.over)) return { kind: 'same' };
                break;
        }
    }
    return { kind: 'same' };
}

// One sync at a time, each after the last, so every one sees what the one before it did.
let tail: Promise<unknown> = Promise.resolve();

/** Brings this device's statement and the account's copy in line, whichever way it goes. */
export function syncStatement(userId: string): Promise<SyncOutcome> {
    const outcome = tail.then(() => run(userId), () => run(userId));
    tail = outcome.catch(() => undefined);
    return outcome;
}

/** "Load from account" on a device emptied with "Clear data". */
export function loadFromAccount(userId: string): Promise<SyncOutcome> {
    setCleared(false);
    return syncStatement(userId);
}
