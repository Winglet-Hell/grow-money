import Papa from 'papaparse';
import * as XLSX from 'xlsx';
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

function mapRow(row: any, type: Transaction['type']): Transaction | null {
    const mapped: Partial<Transaction> = {};

    // Checking if row has necessary data
    let hasData = false;

    for (const [rusHeader, engKey] of Object.entries(HEADERS_MAP)) {
        // Try exact match or trimmed match
        let value = row[rusHeader];
        if (value === undefined) {
            // fallback: try finding key with whitespace
            const key = Object.keys(row).find(k => k.trim() === rusHeader);
            if (key) value = row[key];
        }

        if (value !== undefined) {
            hasData = true;

            if (engKey === 'amount') {
                // value might be string with currency or number
                if (typeof value === 'string') {
                    // Remove spaces, symbols, replace comma with dot
                    value = parseFloat(value.replace(/[^\d.,-]/g, '').replace(',', '.'));
                }
                if (isNaN(value)) value = 0;

                // For Expenses, we expect negative numbers usually, or we treat them as cost.
                // Re-reading logic: "Total Spent" in CategoryInsights relies on magnitude.
                // Standard: Expenses are negative, Income positive.
                // If type is expense and value is positive, should we flip it?
                // Often bank exports are mixed. 
                // Let's keep raw value for now, but ensure consistency if possible.
                // actually, let's just parse the number as is.
                if (type === 'expense' && value > 0) {
                    value = -value;
                }
            } else if (engKey === 'originalAmount') {
                if (typeof value === 'string') {
                    value = parseFloat(value.replace(/[^\d.,-]/g, '').replace(',', '.'));
                }
                if (isNaN(value)) value = 0;
            } else if (engKey === 'date') {
                if (value instanceof Date) {
                    mapped[engKey] = value.toISOString();
                } else if (typeof value === 'number') {
                    // Excel serial date
                    const dateObj = new Date(Math.round((value - 25569) * 86400 * 1000));
                    mapped[engKey] = dateObj.toISOString();
                } else {
                    const d = new Date(String(value));
                    if (!isNaN(d.getTime())) {
                        mapped[engKey] = d.toISOString();
                    } else {
                        mapped[engKey] = String(value);
                    }
                }
            }

            mapped[engKey] = value;
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
                // CSV doesn't have sheets, default to 'expense' or try to guess?
                // Let's default to expense for safety or maybe check headers/filename?
                // Assuming CSV is generic, let's mark as expense for now or maybe 'transfer' if mixed?
                // Actually, without sheets, distinguishing is hard. 
                // Let's assume CSV is mixed and try to guess from amount? No.
                // Let's default to 'expense' as it's the primary use case, or 'income' if positive?
                // Let's check filename.
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

function parseExcel(file: File): Promise<Transaction[]> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary', cellDates: true });

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
                        // Skip unknown sheets or maybe default?
                        // User said: "first list is expenses, second income, third transfers"
                        // If names match, great.
                        continue;
                    }

                    const sheet = workbook.Sheets[sheetName];
                    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

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

                    const jsonData = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex });
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
