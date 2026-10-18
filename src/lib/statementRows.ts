import type { Transaction } from '../types';
import { contentId } from './transactionId';

// One row of the source app's export, turned into a Transaction. The xlsx/csv parser feeds it the
// sheets' rows; the backup reader (lib/backup) rebuilds the same rows from the app's database, so
// both imports give the same transactions, ids included.

// ==========================================
// SHARED CONSTANTS & HELPERS
// ==========================================

const HEADERS_MAP: Record<string, keyof Omit<Transaction, 'id' | 'type'>> = {
    'Дата и время': 'date',
    'Категория': 'category',
    'Счет': 'account',
    'Комментарий': 'note',
    'Теги': 'tags',

    // Legacy/Fallback columns (might be empty in this file fmt)
    'Сумма операции в валюте операции': 'originalAmount',
    'Валюта операции': 'originalCurrency',
    'Сумма в валюте операции': 'originalAmount',

    // Definitive columns (PREFFERED - defined last to overwrite legacy)
    'Сумма в валюте учета': 'amount',       // MAIN AMOUNT (RUB)
    'Валюта учета': 'currency',             // MAIN CURRENCY (RUB)
    'Сумма в валюте счета': 'originalAmount', // SECONDARY AMOUNT (THB)
    'Валюта счета': 'originalCurrency',       // SECONDARY CURRENCY (THB)

    // Transfer specific headers
    'Исходящий счет': 'account',
    'Входящий счет': 'category',
    'Сумма в исходящей валюте счета': 'amount',
    'Валюта исходящего счета': 'originalCurrency',
    'Сумма во входящей валюте': 'originalAmount',
    'Сумма во входящем счете': 'originalAmount',
    'Валюта входящая': 'originalCurrency',
    'Валюта входящего счета': 'originalCurrency',
};

function toSentenceCase(str: string): string {
    if (!str) return str;
    const lower = str.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// Helper to parse DD.MM.YYYY or YYYY-MM-DD
function parseDateString(value: string): string | null {
    // Try DD.MM.YYYY
    const ruMatch = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (ruMatch) {
        const day = ruMatch[1].padStart(2, '0');
        const month = ruMatch[2].padStart(2, '0');
        const year = ruMatch[3];
        return `${year}-${month}-${day}`;
    }

    // Try YYYY-MM-DD
    const isoMatch = value.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
    if (isoMatch) {
        const year = isoMatch[1];
        const month = isoMatch[2].padStart(2, '0');
        const day = isoMatch[3].padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Fallback to Date parse (risky for timezones, but last resort)
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    return null;
}


// Read a cell by header name, tolerating leading/trailing whitespace in the sheet header.
function readCell(row: any, headers: string[], name: string): any {
    let value = row[name];
    if (value === undefined) {
        const key = headers.find(k => k.trim() === name);
        if (key) value = row[key];
    }
    return value;
}

// Parse a possibly-formatted numeric string ("1 000,50", "142000.00") into a number.
function toNumber(value: any): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'number') return isNaN(value) ? undefined : value;
    const n = parseFloat(String(value).replace(/[^\d.,-]/g, '').replace(',', '.'));
    return isNaN(n) ? undefined : n;
}

function normalizeCurrency(value: any): string | undefined {
    if (value === undefined || value === null) return undefined;
    const s = String(value).trim().toUpperCase();
    return s === '' ? undefined : s;
}

// Explicitly capture both legs of a transfer from the "Переводы" sheet.
// This is additive: it does NOT alter the generic amount/originalCurrency mapping
// that account-balance logic relies on. It only fills the dedicated transfer fields
// so that cross-currency exchange rates can be computed downstream.
function extractTransferLegs(row: any, headers: string[]): Pick<Transaction, 'fromAmount' | 'fromCurrency' | 'toAmount' | 'toCurrency'> {
    return {
        fromAmount: toNumber(readCell(row, headers, 'Сумма в исходящей валюте счета')),
        fromCurrency: normalizeCurrency(readCell(row, headers, 'Валюта исходящего счета')),
        toAmount: toNumber(readCell(row, headers, 'Сумма во входящей валюте счета')),
        toCurrency: normalizeCurrency(readCell(row, headers, 'Валюта входящего счета')),
    };
}

// `date1904`: the workbook counts serial dates from 1904 (old Mac Excel) instead of 1900.
export function mapRow(row: any, type: Transaction['type'], index: number, date1904 = false): Transaction | null {
    const mapped: any = {}; // Use any to allow flexible mapping temporarily

    // ... (existing data extraction logic remains same, we only need to change the return part)
    // Checking if row has necessary data
    let hasData = false;
    const headers = Object.keys(row);

    for (const [rusHeader, engKey] of Object.entries(HEADERS_MAP)) {
        let value: any = row[rusHeader];
        if (value === undefined) {
            const key = headers.find(k => k.trim() === rusHeader);
            if (key) value = row[key];
        }

        if (value !== undefined && value !== '') { // Added check for empty string
            hasData = true;

            // Logic for amount parsing
            if (engKey === 'amount' || engKey === 'originalAmount') {
                // ... numeric parsing logic ...
                if (typeof value === 'string') {
                    value = parseFloat(value.replace(/[^\d.,-]/g, '').replace(',', '.'));
                }
                if (isNaN(value)) value = 0;
            }
            // ... date logic ...
            else if (engKey === 'date') {
                // ... existing date logic ...
                try {
                    if (typeof value === 'number') {
                        // Excel serial date. Checked before the string parsers: sheets are read
                        // with raw values (see parseExcelData), and new Date("46229") is the year 46229.
                        const excelEpoch = new Date(Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30));
                        const msPerDay = 86400 * 1000;
                        const dateObj = new Date(excelEpoch.getTime() + value * msPerDay);
                        const year = dateObj.getUTCFullYear();
                        const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, '0');
                        const day = dateObj.getUTCDate().toString().padStart(2, '0');
                        value = `${year}-${month}-${day}`;
                    } else {
                        const strVal = String(value).trim();
                        value = parseDateString(strVal) ?? strVal; // Fallback
                    }
                } catch (e) {
                    value = String(value);
                }
            }

            // ASSIGNMENT with overwrite check?
            // Since we reordered HEADERS_MAP to put preferred keys Last, overwriting is generally desired
            // IF the value is valid. 
            // We kept the check `value !== ''` at the top, so we are good.
            mapped[engKey] = value;
        }
    }

    if (!hasData || !mapped.date) return null;

    // --- CURRENCY & AMOUNT NORMALIZATION ---

    // Ensure signs are correct for expenses
    if (type === 'expense') {
        if (mapped.amount > 0) mapped.amount = -mapped.amount;
        if (mapped.originalAmount > 0) mapped.originalAmount = -mapped.originalAmount;
    }

    // If originalAmount is practically the same as amount, remove it (redundant)
    if (mapped.originalAmount !== undefined && mapped.originalAmount !== 0) {
        if (Math.abs(mapped.amount - mapped.originalAmount) < 0.01 &&
            (!mapped.originalCurrency || mapped.originalCurrency === mapped.currency)) {
            delete mapped.originalAmount;
            delete mapped.originalCurrency;
        }
    } else {
        // If 0 or undefined, just remove to keep object clean
        delete mapped.originalAmount;
    }

    const tags = String(mapped.tags || '').split(',')
        .map((tag: string) => toSentenceCase(tag.trim()))
        .filter(tag => tag !== '');

    // STABLE ID GENERATION (Content-Based)
    // We intentionally OMIT the 'index' from the signature to ensure IDs match across file versions
    // regardless of row position.
    // Collisions (duplicates) will be handled in a post-processing step.
    const id = contentId({
        date: String(mapped.date),
        amount: Number(mapped.amount),
        account: String(mapped.account || 'Unknown'),
        category: toSentenceCase(String(mapped.category || 'Uncategorized')),
        note: String(mapped.note || ''),
        originalAmount: mapped.originalAmount,
    });

    const t: Transaction = {
        id,
        date: String(mapped.date),
        category: toSentenceCase(String(mapped.category || 'Uncategorized')),
        amount: Number(mapped.amount),
        currency: mapped.currency ? String(mapped.currency) : undefined, // Explicit currency from file
        account: String(mapped.account || 'Unknown'),
        note: String(mapped.note || ''),
        tags: tags,
        originalAmount: mapped.originalAmount,
        originalCurrency: mapped.originalCurrency ? String(mapped.originalCurrency) : undefined,
        type,
        index, // Save the index/row number
    };

    // For transfers, additionally capture both legs verbatim so cross-currency
    // exchange rates can be derived (the generic mapping above loses the outgoing currency).
    if (type === 'transfer') {
        Object.assign(t, extractTransferLegs(row, headers));
    }

    return t;
}

// Post-processor to ensure unique IDs for identical transactions
// Preserves stability by appending suffix based on occurrence order
export function uniquifyIds(transactions: Transaction[]): Transaction[] {
    const idCounts = new Map<string, number>();

    return transactions.map(t => {
        const count = idCounts.get(t.id) || 0;
        idCounts.set(t.id, count + 1);

        if (count > 0) {
            // Collision detected (e.g. 2nd identical coffee)
            // Append suffix to make it unique but stable (assuming relative order is preserved)
            return { ...t, id: `${t.id}_${count}` };
        }
        return t;
    });
}
