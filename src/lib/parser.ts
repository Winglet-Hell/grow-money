import Papa from 'papaparse';

import type { Transaction } from '../types';

const HEADERS_MAP: Record<string, keyof Omit<Transaction, 'id' | 'type'>> = {
    'Дата и время': 'date',
    'Категория': 'category',
    'Сумма в валюте учета': 'amount',
    'Счет': 'account',
    'Комментарий': 'note',
    'Теги': 'tags',
    'Сумма в валюте счета': 'originalAmount',
    'Валюта счета': 'originalCurrency',
    // Transfer specific headers
    'Исходящий счет': 'account',
    'Входящий счет': 'category', // We'll store Destination Account in 'category' for transfers
    'Сумма в исходящей валюте': 'amount',
    'Сумма во входящей валюте': 'originalAmount',
    'Валюта вход': 'originalCurrency'
};

export async function parseFile(file: File): Promise<Transaction[]> {
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'csv') {
        return parseCSV(file);
    } else if (['xlsx', 'xls'].includes(extension || '')) {
        return parseExcel(file);
    } else {
        throw new Error('Unsupported file format. Please upload CSV or Excel.');
    }
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

function mapRow(row: any, type: Transaction['type']): Transaction | null {
    const mapped: Partial<Transaction> = {};

    // Checking if row has necessary data
    let hasData = false;

    // Use a fuzzy match for headers first
    const headers = Object.keys(row);

    for (const [rusHeader, engKey] of Object.entries(HEADERS_MAP)) {
        let value: any = row[rusHeader];

        if (value === undefined) {
            const key = headers.find(k => k.trim() === rusHeader);
            if (key) value = row[key];
        }

        if (value !== undefined) {
            hasData = true;

            if (engKey === 'amount' || engKey === 'originalAmount') {
                if (typeof value === 'string') {
                    value = parseFloat(value.replace(/[^\d.,-]/g, '').replace(',', '.'));
                }
                if (isNaN(value)) value = 0;

                if (engKey === 'amount' && type === 'expense' && value > 0) {
                    value = -value;
                }
                mapped[engKey] = value;
            } else if (engKey === 'date') {
                try {
                    // With raw: false, value should be a formatted string like "07.01.2026"
                    const strVal = String(value).trim();
                    const parsed = parseDateString(strVal);

                    if (parsed) {
                        mapped[engKey] = parsed;
                    } else {
                        // Fallback check for number (Excel serial)
                        if (typeof value === 'number') {
                            const excelEpoch = new Date(Date.UTC(1899, 11, 30));
                            const msPerDay = 86400 * 1000;
                            const dateObj = new Date(excelEpoch.getTime() + value * msPerDay);

                            const year = dateObj.getUTCFullYear();
                            const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, '0');
                            const day = dateObj.getUTCDate().toString().padStart(2, '0');
                            mapped[engKey] = `${year}-${month}-${day}`;
                        } else {
                            // Last resort basic parse
                            const d = new Date(strVal);
                            if (!isNaN(d.getTime())) {
                                const year = d.getFullYear();
                                const month = (d.getMonth() + 1).toString().padStart(2, '0');
                                const day = d.getDate().toString().padStart(2, '0');
                                mapped[engKey] = `${year}-${month}-${day}`;
                            } else {
                                mapped[engKey] = strVal;
                            }
                        }
                    }
                } catch (e) {
                    mapped[engKey] = String(value);
                }
            } else {
                mapped[engKey] = value;
            }
        }
    }

    if (!hasData || !mapped.date || !mapped.amount) return null;

    return {
        id: Math.random().toString(36).substr(2, 9),
        date: String(mapped.date),
        category: toSentenceCase(String(mapped.category || 'Uncategorized')),
        amount: Number(mapped.amount),
        account: String(mapped.account || 'Unknown'),
        note: String(mapped.note || ''),
        tags: String(mapped.tags || '').split(',').map(tag => toSentenceCase(tag.trim())).join(', '),
        originalAmount: mapped.originalAmount,
        originalCurrency: mapped.originalCurrency ? String(mapped.originalCurrency) : undefined,
        type,
    } as Transaction;
}

function parseCSV(file: File): Promise<Transaction[]> {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                // Check filename for type hints
                const type: Transaction['type'] = file.name.toLowerCase().includes('income') || file.name.toLowerCase().includes('доход') ? 'income' : 'expense';

                const transactions = results.data
                    .map((row: any) => mapRow(row, type))
                    .filter((t): t is Transaction => t !== null);

                if (transactions.length === 0) {
                    reject(new Error('No valid transactions found. Check file headers.'));
                } else {
                    resolve(transactions);
                }
            },
            error: (error) => reject(error)
        });
    });
}

async function parseExcel(file: File): Promise<Transaction[]> {
    const XLSX = await import('xlsx');

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                // raw: false forces getting the formatted string (e.g. "25.10.2023")
                // cellDates: false ensures we don't get Date objects
                const workbook = XLSX.read(data, { type: 'binary', cellDates: false });

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
                        .map((row: any) => mapRow(row, type!))
                        .filter((t): t is Transaction => t !== null);

                    allTransactions = [...allTransactions, ...sheetTransactions];
                }

                if (allTransactions.length === 0) {
                    reject(new Error('No valid transactions found. Check file headers/sheet names (Расходы, Доходы, Переводы).'));
                } else {
                    resolve(allTransactions);
                }
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsBinaryString(file);
    });
}

function toSentenceCase(str: string): string {
    if (!str) return str;
    const lower = str.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}
