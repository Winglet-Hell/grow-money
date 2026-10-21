
import Papa from 'papaparse';
import type { BackupExtras, Transaction } from '../types';
import { mapRow, uniquifyIds } from './statementRows';
import { parseExcelStatement } from './excelStatement';
import sqlWasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';

// ==========================================
// PARSING LOGIC
// ==========================================

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
async function parseBackupData(fileData: ArrayBuffer): Promise<{ transactions: Transaction[]; backup: BackupExtras }> {
    const [{ default: initSqlJs }, { readBackup }] = await Promise.all([import('sql.js'), import('./backup')]);
    const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
    const { transactions, wallets, categories, photos } = await readBackup(new Uint8Array(fileData), SQL);
    return { transactions, backup: { wallets, categories, photos } };
}


// ==========================================
// WORKER MESSAGE HANDLER
// ==========================================

self.onmessage = async (e: MessageEvent) => {
    const { fileData, fileName, fileType } = e.data;

    try {
        let transactions: Transaction[] = [];
        let backup: BackupExtras | undefined;

        if (fileType === 'xlsx' || fileType === 'xls') {
            transactions = await parseExcelStatement(fileData as ArrayBuffer);
        } else if (fileType === 'csv') {
            transactions = await parseCSVData(fileData as string, fileName);
        } else if (fileType === 'mmbackup') {
            ({ transactions, backup } = await parseBackupData(fileData as ArrayBuffer));
        } else {
            throw new Error(`Unsupported file type: ${fileType}`);
        }

        self.postMessage({ status: 'success', data: transactions, backup });
    } catch (error: any) {
        self.postMessage({ status: 'error', error: error.message });
    }
};
