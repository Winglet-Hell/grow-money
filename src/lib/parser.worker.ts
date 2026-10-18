
import Papa from 'papaparse';
import type { Transaction, WalletSnapshot } from '../types';
import { mapRow, uniquifyIds } from './statementRows';
import sqlWasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';

// ==========================================
// PARSING LOGIC
// ==========================================

async function parseExcelData(fileData: ArrayBuffer): Promise<Transaction[]> {
    const XLSX = await import('xlsx');
    // cellDates: false ensures we don't get Date objects (dates stay Excel serial numbers)
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

        // Raw cell values, not the formatted text: the export formats every amount as "0.00",
        // which turns 0.00005 BTC into 0 (dropped as "no amount") and 1.23456 BTC into 1.23.
        // Dates then arrive as Excel serial numbers, which mapRow converts.
        const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904);
        const jsonData = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex, raw: true });
        const sheetTransactions = jsonData
            .map((row: any, index: number) => mapRow(row, type!, index, date1904))
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

// The source app's backup is its SQLite database; sql.js, which reads it, loads only for backups.
async function parseBackupData(fileData: ArrayBuffer): Promise<{ transactions: Transaction[]; wallets: WalletSnapshot }> {
    const [{ default: initSqlJs }, { readBackup }] = await Promise.all([import('sql.js'), import('./backup')]);
    const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
    return readBackup(new Uint8Array(fileData), SQL);
}


// ==========================================
// WORKER MESSAGE HANDLER
// ==========================================

self.onmessage = async (e: MessageEvent) => {
    const { fileData, fileName, fileType } = e.data;

    try {
        let transactions: Transaction[] = [];
        let wallets: WalletSnapshot | undefined;

        if (fileType === 'xlsx' || fileType === 'xls') {
            transactions = await parseExcelData(fileData as ArrayBuffer);
        } else if (fileType === 'csv') {
            transactions = await parseCSVData(fileData as string, fileName);
        } else if (fileType === 'mmbackup') {
            ({ transactions, wallets } = await parseBackupData(fileData as ArrayBuffer));
        } else {
            throw new Error(`Unsupported file type: ${fileType}`);
        }

        self.postMessage({ status: 'success', data: transactions, wallets });
    } catch (error: any) {
        self.postMessage({ status: 'error', error: error.message });
    }
};
