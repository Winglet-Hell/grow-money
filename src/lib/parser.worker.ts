
import Papa from 'papaparse';
import type { Transaction } from '../types';

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


// Simple hash function for deterministic IDs
function generateHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
}

function mapRow(row: any, type: Transaction['type'], index: number): Transaction | null {
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
                    const strVal = String(value).trim();
                    const parsed = parseDateString(strVal);
                    if (parsed) value = parsed;
                    else if (typeof value === 'number') {
                        // ... excel date logic ...
                        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
                        const msPerDay = 86400 * 1000;
                        const dateObj = new Date(excelEpoch.getTime() + value * msPerDay);
                        const year = dateObj.getUTCFullYear();
                        const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, '0');
                        const day = dateObj.getUTCDate().toString().padStart(2, '0');
                        value = `${year}-${month}-${day}`;
                    } else value = strVal; // Fallback
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
    const signature = `${String(mapped.date)}|${Number(mapped.amount)}|${String(mapped.account || 'Unknown')}|${toSentenceCase(String(mapped.category || 'Uncategorized'))}|${String(mapped.note || '')}|${Number(mapped.originalAmount || 0)}`;
    const id = generateHash(signature);

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

    return t;
}

// Post-processor to ensure unique IDs for identical transactions
// Preserves stability by appending suffix based on occurrence order
function uniquifyIds(transactions: Transaction[]): Transaction[] {
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

// ==========================================
// PARSING LOGIC
// ==========================================

async function parseExcelData(fileData: ArrayBuffer): Promise<Transaction[]> {
    const XLSX = await import('xlsx');
    // raw: false forces getting the formatted string (e.g. "25.10.2023")
    // cellDates: false ensures we don't get Date objects
    const workbook = XLSX.read(fileData, { type: 'array', cellDates: false });

    let allTransactions: Transaction[] = [];

    for (const sheetName of workbook.SheetNames) {
        const normalizedSheetName = sheetName.trim().toLowerCase();
        let type: Transaction['type'] | null = null;

        if (normalizedSheetName.includes('расходы') || normalizedSheetName.includes('expenses')) {
            type = 'expense';
        } else if (normalizedSheetName.includes('доходы') || normalizedSheetName.includes('income')) {
            type = 'income';
        } else if (normalizedSheetName.includes('переводы') || normalizedSheetName.includes('transfers')) {
            type = 'transfer';
        } else {
            continue;
        }

        const sheet = workbook.Sheets[sheetName];
        // raw: false ensures we get formatted strings
        const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as any[][];

        if (!rawData || rawData.length === 0) continue;

        // Find header row
        let headerRowIndex = -1;
        for (let i = 0; i < Math.min(rawData.length, 20); i++) {
            const row = rawData[i];
            if (row && row.some((cell: any) => String(cell).includes('Дата и время'))) {
                headerRowIndex = i;
                break;
            }
        }

        if (headerRowIndex === -1) continue;

        const jsonData = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex, raw: false });
        const sheetTransactions = jsonData
            .map((row: any, index: number) => mapRow(row, type!, index))
            .filter((t): t is Transaction => t !== null);

        allTransactions = [...allTransactions, ...sheetTransactions];
    }

    if (allTransactions.length === 0) {
        throw new Error('No valid transactions found. Check file headers/sheet names (Расходы, Доходы, Переводы).');
    }

    return uniquifyIds(allTransactions);
}

async function parseCSVData(fileContent: string, fileName: string): Promise<Transaction[]> {
    return new Promise((resolve, reject) => {
        Papa.parse(fileContent, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                // Check filename for type hints
                const type: Transaction['type'] = fileName.toLowerCase().includes('income') || fileName.toLowerCase().includes('доход') ? 'income' : 'expense';

                const transactions = results.data
                    .map((row: any, index: number) => mapRow(row, type, index))
                    .filter((t): t is Transaction => t !== null);

                if (transactions.length === 0) {
                    reject(new Error('No valid transactions found. Check file headers.'));
                } else {
                    resolve(uniquifyIds(transactions));
                }
            },
            error: (error: any) => reject(error)
        });
    });
}


// ==========================================
// WORKER MESSAGE HANDLER
// ==========================================

self.onmessage = async (e: MessageEvent) => {
    const { fileData, fileName, fileType } = e.data;

    try {
        let transactions: Transaction[] = [];

        if (fileType === 'xlsx' || fileType === 'xls') {
            transactions = await parseExcelData(fileData as ArrayBuffer);
        } else if (fileType === 'csv') {
            transactions = await parseCSVData(fileData as string, fileName);
        } else {
            throw new Error(`Unsupported file type: ${fileType}`);
        }

        self.postMessage({ status: 'success', data: transactions });
    } catch (error: any) {
        self.postMessage({ status: 'error', error: error.message });
    }
};
