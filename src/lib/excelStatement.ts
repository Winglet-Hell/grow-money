import type { Transaction } from '../types';
import { mapRow, uniquifyIds } from './statementRows';

// The expense app's Excel export: one sheet each for expenses, income and transfers. Read by the
// parser worker in the browser and by the MCP server in Node.

export async function parseExcelStatement(fileData: ArrayBuffer): Promise<Transaction[]> {
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
        const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false });

        if (!rawData || rawData.length === 0) continue;

        // Find header row
        let headerRowIndex = -1;
        for (let i = 0; i < Math.min(rawData.length, 20); i++) {
            const row = rawData[i];
            if (row && row.some(cell => String(cell).includes('Дата и время'))) {
                headerRowIndex = i;
                break;
            }
        }

        if (headerRowIndex === -1) continue;

        // Raw cell values, not the formatted text: the export formats every amount as "0.00",
        // which turns 0.00005 BTC into 0 (dropped as "no amount") and 1.23456 BTC into 1.23.
        // Dates then arrive as Excel serial numbers, which mapRow converts.
        const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904);
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: headerRowIndex, raw: true });
        const sheetTransactions = jsonData
            .map((row, index) => mapRow(row, type!, index, date1904))
            .filter((t): t is Transaction => t !== null);

        allTransactions = [...allTransactions, ...sheetTransactions];
    }

    if (allTransactions.length === 0) {
        throw new Error('No valid transactions found. Check file headers/sheet names (Расходы, Доходы, Переводы).');
    }

    return uniquifyIds(allTransactions);
}
