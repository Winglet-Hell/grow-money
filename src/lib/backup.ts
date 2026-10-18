import { unzipSync } from 'fflate';
import type { Database, SqlJsStatic, SqlValue } from 'sql.js';
import type { Transaction, WalletSnapshot } from '../types';
import { mapRow, uniquifyIds } from './statementRows';

// A backup made by the source app (".mmbackup"): a short header, then a zip holding the app's
// SQLite database and receipt photos. It has everything the xlsx export has and more: balance
// corrections, the app's own ids, wallet balances. Read so far: the operations and the wallets.
// Every operation is rebuilt as the export's row and goes through the same mapRow, so a backup
// gives the very transactions an export made the same day does. Only the id differs: the app's
// own, which survives edits, with the export's content hash kept as `exportId`.

const DB_FILE = 'MyFinance.db';

// The columns read below. The format is the app's own and undocumented, so a backup from a
// changed app is turned away plainly instead of being half imported.
const REQUIRED_COLUMNS: Record<string, string[]> = {
    transaction: ['uid', 'created', 'modified', 'type', 'amountInDefaultCurrency', 'amountInRealCurrency', 'amountInAccountCurrency', 'date', 'comment', 'isRemoved'],
    transfer: ['uid', 'created', 'modified', 'fromAmount', 'fromCurrencyCode', 'toAmount', 'toCurrencyCode', 'date', 'comment', 'isRemoved'],
    account: ['uid', 'modified', 'title', 'currencyCode', 'position', 'isActive', 'isArchived', 'isRemoved'],
    account_balance: ['uid', 'value'],
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

function readOperations(db: Database, main: string, units: (code: string) => number): Transaction[] {
    const accounts = new Map(select(db, 'SELECT uid, title, currencyCode FROM account')
        .map(r => [String(r.uid), { title: String(r.title ?? ''), currency: String(r.currencyCode ?? '') }]));
    const categories = new Map(select(db, 'SELECT uid, title FROM category').map(r => [String(r.uid), String(r.title ?? '')]));
    const tags = new Map(select(db, 'SELECT uid, name FROM tag').map(r => [String(r.uid), String(r.name ?? '')]));
    const accountOf = links(db, 'Transaction', 'Account');
    const categoryOf = links(db, 'Transaction', 'Category');
    const tagsOf = links(db, 'Transaction', 'Tag');
    const fromOf = links(db, 'Transfer', 'FromAccount');
    const toOf = links(db, 'Transfer', 'ToAccount');

    // The export's sheets, each row with the app's id: newest day first, and within a day the
    // latest entered first.
    type SheetRow = { uid: string; row: Record<string, unknown> };
    const sheets = { expense: [] as SheetRow[], income: [] as SheetRow[], transfer: [] as SheetRow[] };

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
        sheet.push({ uid, row: {
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
        } });
    }

    for (const t of select(db, `
        SELECT uid, date, comment, fromAmount, fromCurrencyCode, toAmount, toCurrencyCode
        FROM transfer WHERE isRemoved = 0 ORDER BY date DESC, created DESC`)) {
        const uid = String(t.uid);
        const fromCurrency = String(t.fromCurrencyCode ?? '');
        const toCurrency = textOrUndefined(t.toCurrencyCode);
        sheets.transfer.push({ uid, row: {
            'Дата и время': textOrUndefined(t.date),
            'Исходящий счет': accounts.get(fromOf.get(uid)?.[0] ?? '')?.title,
            'Входящий счет': accounts.get(toOf.get(uid)?.[0] ?? '')?.title,
            'Сумма в исходящей валюте счета': amountOrUndefined(t.fromAmount, units(fromCurrency)),
            'Валюта исходящего счета': currencyLabel(fromCurrency),
            // Both empty when the two wallets hold the same currency, as in the export.
            'Сумма во входящей валюте счета': toCurrency && amountOrUndefined(t.toAmount, units(toCurrency)),
            'Валюта входящего счета': toCurrency && currencyLabel(toCurrency),
            'Комментарий': textOrUndefined(t.comment),
        } });
    }

    const parsed = (Object.keys(sheets) as (keyof typeof sheets)[]).flatMap(type =>
        sheets[type].flatMap(({ uid, row }, index) => {
            const t = mapRow(row, type, index);
            return t ? [{ uid, t }] : [];
        }));
    if (parsed.length === 0) throw new Error('No operations found in the backup.');
    // Numbered the way the export numbers repeats, so the hash matches an export's id exactly.
    const hashed = uniquifyIds(parsed.map(p => p.t));
    return hashed.map((t, i) => ({ ...t, id: parsed[i].uid, exportId: t.id }));
}

/** Each wallet's balance day by day: every operation moves it, balance corrections included, so
 *  the running sum ends exactly on the balance the app shows. Kept in stored integers. */
function balanceMoves(db: Database): Map<string, Map<string, number>> {
    const moves = new Map<string, Map<string, number>>();
    const move = (account: SqlValue, day: SqlValue, amount: number) => {
        if (account === null || day === null || !amount) return;
        const days = moves.get(String(account)) ?? new Map<string, number>();
        days.set(String(day), (days.get(String(day)) ?? 0) + amount);
        moves.set(String(account), days);
    };
    for (const t of select(db, `
        SELECT l.otherUid AS account, t.date, t.type, COALESCE(t.amountInAccountCurrency, t.amountInRealCurrency) AS amount
        FROM "transaction" t
        JOIN sync_link l ON l.entityType = 'Transaction' AND l.entityUid = t.uid AND l.otherType = 'Account' AND l.isRemoved = 0
        WHERE t.isRemoved = 0`)) {
        move(t.account, t.date, (t.type === 'Income' ? 1 : -1) * Number(t.amount ?? 0));
    }
    for (const t of select(db, `
        SELECT f.otherUid AS source, d.otherUid AS target, t.date, t.fromAmount, COALESCE(t.toAmount, t.fromAmount) AS toAmount
        FROM transfer t
        JOIN sync_link f ON f.entityType = 'Transfer' AND f.entityUid = t.uid AND f.otherType = 'FromAccount' AND f.isRemoved = 0
        JOIN sync_link d ON d.entityType = 'Transfer' AND d.entityUid = t.uid AND d.otherType = 'ToAccount' AND d.isRemoved = 0
        WHERE t.isRemoved = 0`)) {
        move(t.source, t.date, -Number(t.fromAmount ?? 0));
        move(t.target, t.date, Number(t.toAmount ?? 0));
    }
    return moves;
}

/** Every wallet the app still has, with the balance it shows and its history. Archived ones are
 *  marked, and so are those switched off (the app's older way of putting a wallet away); deleted
 *  ones are left out. */
function readWallets(db: Database, units: (code: string) => number): WalletSnapshot['wallets'] {
    const moves = balanceMoves(db);
    return select(db, `
        SELECT a.uid, a.title, a.currencyCode, a.isActive, a.isArchived, COALESCE(b.value, 0) AS balance
        FROM account a LEFT JOIN account_balance b ON b.uid = a.uid
        WHERE a.isRemoved = 0 ORDER BY a.position`)
        .map(a => {
            const currency = String(a.currencyCode ?? '');
            const perUnit = units(currency);
            let running = 0;
            const history = [...(moves.get(String(a.uid)) ?? new Map<string, number>())]
                .sort(([x], [y]) => x.localeCompare(y))
                .map(([day, amount]): [string, number] => [day, (running += amount) / perUnit]);
            return {
                name: String(a.title ?? ''),
                currency: currencyLabel(currency),
                balance: Number(a.balance) / perUnit,
                archived: a.isArchived === 1 || a.isActive === 0,
                history,
            };
        });
}

/** When the balances held: the latest moment the backup knows of, which is its last edit or
 *  the app's last sync with its server (done whenever the app opens), whichever came later. */
function balancesAsOf(db: Database): string {
    const stamps = select(db, `
        SELECT MAX(modified) AS at FROM "transaction"
        UNION ALL SELECT MAX(modified) FROM transfer
        UNION ALL SELECT MAX(modified) FROM account`).map(r => r.at);
    if (select(db, "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sync_data'").length) {
        stamps.push(...select(db, "SELECT value AS at FROM sync_data WHERE key = 'syncCompletedDate'").map(r => r.at));
    }
    // UTC stamps with 3 or 6 decimals: compare them to the second.
    const seconds = stamps
        .map(at => (typeof at === 'string' ? /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.exec(at)?.[0] : undefined))
        .filter((at): at is string => !!at)
        .sort();
    return seconds.length ? `${seconds[seconds.length - 1]}.000Z` : new Date().toISOString();
}

export interface BackupStatement {
    transactions: Transaction[];
    wallets: WalletSnapshot;
}

/** Reads a backup file: the same transactions an xlsx export of it gives, plus the wallets. */
export function readBackup(file: Uint8Array, SQL: SqlJsStatic): BackupStatement {
    const db = new SQL.Database(unpackDatabase(file));
    try {
        checkFormat(db);
        const main = String(select(db, "SELECT value FROM syncable_settings WHERE uid = 'defaultCurrencyCode'")[0]?.value ?? 'RUB');
        const units = unitsPerWhole(db, main);
        return {
            transactions: readOperations(db, main, units),
            wallets: { asOf: balancesAsOf(db), wallets: readWallets(db, units) },
        };
    } finally {
        db.close();
    }
}
