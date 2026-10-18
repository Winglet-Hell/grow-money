import { unzipSync } from 'fflate';
import type { Database, SqlJsStatic, SqlValue } from 'sql.js';
import type { Transaction } from '../types';
import { mapRow, uniquifyIds } from './statementRows';

// A backup made by the source app (".mmbackup"): a short header, then a zip holding the app's
// SQLite database and receipt photos. It has everything the xlsx export has and more: balance
// corrections, the app's own ids, wallet balances. For now only what the export has is read.
// Every operation is rebuilt as the export's row and goes through the same mapRow, so a backup
// gives the very transactions, ids included, that an export made the same day does.

const DB_FILE = 'MyFinance.db';

// The columns read below. The format is the app's own and undocumented, so a backup from a
// changed app is turned away plainly instead of being half imported.
const REQUIRED_COLUMNS: Record<string, string[]> = {
    transaction: ['uid', 'created', 'type', 'amountInDefaultCurrency', 'amountInRealCurrency', 'amountInAccountCurrency', 'date', 'comment', 'isRemoved'],
    transfer: ['uid', 'created', 'fromAmount', 'fromCurrencyCode', 'toAmount', 'toCurrencyCode', 'date', 'comment', 'isRemoved'],
    account: ['uid', 'title', 'currencyCode'],
    category: ['uid', 'title'],
    tag: ['uid', 'name'],
    rates: ['fromCurrencyCode', 'toCurrencyCode', 'value'],
    syncable_settings: ['uid', 'value'],
    sync_link: ['entityType', 'entityUid', 'otherType', 'otherUid', 'modified', 'isRemoved'],
};

// Amounts are integers in each currency's smallest unit as the app counts it: hundredths for
// most money (VND and IDR too), whole yen and won, 1e-8 for crypto ("ct:BTC"). These are the
// app's own choices, so for other money the unit is read off the rows (see unitsPerWhole).
const WHOLE_UNIT_CURRENCIES = new Set(['JPY', 'KRW']);

type Row = Record<string, SqlValue>;

function select(db: Database, sql: string, params: SqlValue[] = []): Row[] {
    const stmt = db.prepare(sql);
    try {
        stmt.bind(params);
        const rows: Row[] = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        return rows;
    } finally {
        stmt.free();
    }
}

function unpackDatabase(file: Uint8Array): Uint8Array {
    // The zip begins after the header (eight 0x08 bytes so far), at its first local file header.
    let start = -1;
    for (let i = 0; i + 3 < Math.min(file.length, 1024); i++) {
        if (file[i] === 0x50 && file[i + 1] === 0x4b && file[i + 2] === 0x03 && file[i + 3] === 0x04) {
            start = i;
            break;
        }
    }
    if (start === -1) throw new Error('This file is not a backup from the expense app.');
    let entries: Record<string, Uint8Array>;
    try {
        entries = unzipSync(file.subarray(start), { filter: f => f.name === DB_FILE });
    } catch {
        throw new Error('The backup is damaged or incomplete. Make a new one in the app and try again.');
    }
    const db = entries[DB_FILE];
    if (!db) throw new Error(`This file is not a backup from the expense app (no ${DB_FILE} inside).`);
    return db;
}

function checkFormat(db: Database): void {
    for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
        const present = new Set(select(db, `PRAGMA table_info("${table}")`).map(c => String(c.name)));
        const missing = present.size ? columns.filter(c => !present.has(c)) : ['the whole table'];
        if (missing.length) {
            throw new Error(`Unsupported backup (${table}: ${missing.join(', ')} missing). The app may have changed its format — import an Excel export instead.`);
        }
    }
}

/** How many stored units make one of each currency. For money not in the list above, whichever
 *  of 1 or 100 brings its rows in line with the app's own rate against the main currency. */
function unitsPerWhole(db: Database, main: string): (code: string) => number {
    const listed = (code: string) => (code.startsWith('ct:') ? 1e8 : WHOLE_UNIT_CURRENCIES.has(code) ? 1 : 100);

    // The app's rates, as units of a currency per one of the main currency.
    const rates = new Map<string, number>();
    for (const r of select(db, 'SELECT fromCurrencyCode, toCurrencyCode, value FROM rates')) {
        const value = Number(r.value);
        if (!(value > 0)) continue;
        if (r.fromCurrencyCode === main) rates.set(String(r.toCurrencyCode), value);
        else if (r.toCurrencyCode === main && !rates.has(String(r.fromCurrencyCode))) rates.set(String(r.fromCurrencyCode), 1 / value);
    }

    // Per wallet currency: the stored amount over the stored main-currency amount, row by row.
    const ratios = new Map<string, number[]>();
    for (const r of select(db, `
        SELECT a.currencyCode AS code, t.amountInDefaultCurrency AS mainAmount,
               COALESCE(t.amountInAccountCurrency, t.amountInRealCurrency) AS amount
        FROM "transaction" t
        JOIN sync_link l ON l.entityType = 'Transaction' AND l.entityUid = t.uid AND l.otherType = 'Account' AND l.isRemoved = 0
        JOIN account a ON a.uid = l.otherUid
        WHERE t.isRemoved = 0 AND t.amountInDefaultCurrency > 0 AND COALESCE(t.amountInAccountCurrency, t.amountInRealCurrency) > 0`)) {
        const list = ratios.get(String(r.code)) ?? [];
        list.push(Number(r.amount) / Number(r.mainAmount));
        ratios.set(String(r.code), list);
    }

    const units = new Map<string, number>();
    for (const [code, list] of ratios) {
        const rate = rates.get(code);
        if (code === main || code.startsWith('ct:') || WHOLE_UNIT_CURRENCIES.has(code) || !rate) continue;
        list.sort((a, b) => a - b);
        // The unit the typical row implies; 10 is halfway between 1 and 100 on a log scale.
        const implied = (list[list.length >> 1] * listed(main)) / rate;
        units.set(code, implied < 10 ? 1 : 100);
    }
    return code => units.get(code) ?? listed(code);
}

/** Every live link of one kind, e.g. each operation's tags: entity uid → other uids, oldest first.
 *  A removed link is history (a category the row had before), so it doesn't count. */
function links(db: Database, entityType: string, otherType: string): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const l of select(db, 'SELECT entityUid, otherUid FROM sync_link WHERE entityType = ? AND otherType = ? AND isRemoved = 0 ORDER BY modified', [entityType, otherType])) {
        const list = map.get(String(l.entityUid)) ?? [];
        list.push(String(l.otherUid));
        map.set(String(l.entityUid), list);
    }
    return map;
}

const amountOrUndefined = (value: SqlValue, units: number) => (value === null ? undefined : Number(value) / units);
const textOrUndefined = (value: SqlValue) => (value === null ? undefined : String(value));
// The export writes crypto codes without the app's "ct:" prefix.
const currencyLabel = (code: string) => code.replace(/^ct:/, '');

function readStatement(db: Database): Transaction[] {
    const main = String(select(db, "SELECT value FROM syncable_settings WHERE uid = 'defaultCurrencyCode'")[0]?.value ?? 'RUB');
    const units = unitsPerWhole(db, main);

    const accounts = new Map(select(db, 'SELECT uid, title, currencyCode FROM account')
        .map(r => [String(r.uid), { title: String(r.title ?? ''), currency: String(r.currencyCode ?? '') }]));
    const categories = new Map(select(db, 'SELECT uid, title FROM category').map(r => [String(r.uid), String(r.title ?? '')]));
    const tags = new Map(select(db, 'SELECT uid, name FROM tag').map(r => [String(r.uid), String(r.name ?? '')]));
    const accountOf = links(db, 'Transaction', 'Account');
    const categoryOf = links(db, 'Transaction', 'Category');
    const tagsOf = links(db, 'Transaction', 'Tag');
    const fromOf = links(db, 'Transfer', 'FromAccount');
    const toOf = links(db, 'Transfer', 'ToAccount');

    // The export's sheets: newest day first, and within a day the latest entered first.
    const sheets = { expense: [] as Record<string, unknown>[], income: [] as Record<string, unknown>[], transfer: [] as Record<string, unknown>[] };

    for (const t of select(db, `
        SELECT uid, type, date, comment, amountInDefaultCurrency, amountInAccountCurrency, amountInRealCurrency
        FROM "transaction" WHERE isRemoved = 0 ORDER BY date DESC, created DESC`)) {
        const uid = String(t.uid);
        const sheet = t.type === 'Expense' ? sheets.expense : t.type === 'Income' ? sheets.income : null;
        const category = categories.get(categoryOf.get(uid)?.[0] ?? '');
        // No category: one of the app's balance corrections, made when a wallet's balance is
        // edited by hand. The export leaves them out, and so does this, for now.
        if (!sheet || category === undefined) continue;
        const account = accounts.get(accountOf.get(uid)?.[0] ?? '');
        sheet.push({
            'Дата и время': textOrUndefined(t.date),
            'Категория': category,
            'Счет': account?.title,
            'Сумма в валюте учета': amountOrUndefined(t.amountInDefaultCurrency, units(main)),
            'Валюта учета': currencyLabel(main),
            // In the wallet's currency: the app fills one of the two, depending on the row's age.
            'Сумма в валюте счета': account && amountOrUndefined(t.amountInAccountCurrency ?? t.amountInRealCurrency, units(account.currency)),
            'Валюта счета': account && currencyLabel(account.currency),
            'Теги': (tagsOf.get(uid) ?? []).map(tag => tags.get(tag)).filter(Boolean).join(', '),
            'Комментарий': textOrUndefined(t.comment),
        });
    }

    for (const t of select(db, `
        SELECT uid, date, comment, fromAmount, fromCurrencyCode, toAmount, toCurrencyCode
        FROM transfer WHERE isRemoved = 0 ORDER BY date DESC, created DESC`)) {
        const uid = String(t.uid);
        const fromCurrency = String(t.fromCurrencyCode ?? '');
        const toCurrency = textOrUndefined(t.toCurrencyCode);
        sheets.transfer.push({
            'Дата и время': textOrUndefined(t.date),
            'Исходящий счет': accounts.get(fromOf.get(uid)?.[0] ?? '')?.title,
            'Входящий счет': accounts.get(toOf.get(uid)?.[0] ?? '')?.title,
            'Сумма в исходящей валюте счета': amountOrUndefined(t.fromAmount, units(fromCurrency)),
            'Валюта исходящего счета': currencyLabel(fromCurrency),
            // Both empty when the two wallets hold the same currency, as in the export.
            'Сумма во входящей валюте счета': toCurrency && amountOrUndefined(t.toAmount, units(toCurrency)),
            'Валюта входящего счета': toCurrency && currencyLabel(toCurrency),
            'Комментарий': textOrUndefined(t.comment),
        });
    }

    const parsed = (Object.keys(sheets) as (keyof typeof sheets)[]).flatMap(type =>
        sheets[type]
            .map((row, index) => mapRow(row, type, index))
            .filter((t): t is Transaction => t !== null));
    if (parsed.length === 0) throw new Error('No operations found in the backup.');
    return uniquifyIds(parsed);
}

/** Reads a backup file into the same transactions an xlsx export of it gives. */
export function readBackup(file: Uint8Array, SQL: SqlJsStatic): Transaction[] {
    const db = new SQL.Database(unpackDatabase(file));
    try {
        checkFormat(db);
        return readStatement(db);
    } finally {
        db.close();
    }
}
