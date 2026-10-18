import type { Transaction, WalletSnapshot } from '../types';
import ParserWorker from './parser.worker?worker';

export interface ParsedStatement {
    transactions: Transaction[];
    wallets?: WalletSnapshot; // only a backup carries them
}

export async function parseFile(file: File): Promise<ParsedStatement> {
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'csv') {
        return parseCSV(file);
    } else if (['xlsx', 'xls'].includes(extension || '')) {
        return parseBinary(file, 'xlsx');
    } else if (extension === 'mmbackup') {
        return parseBinary(file, 'mmbackup');
    } else {
        throw new Error('Unsupported file format. Please upload an Excel or CSV export, or a .mmbackup backup.');
    }
}

function runWorker(message: any): Promise<ParsedStatement> {
    return new Promise((resolve, reject) => {
        const worker = new ParserWorker();

        worker.onmessage = (e) => {
            const { status, data, wallets, error } = e.data;
            if (status === 'success') {
                resolve({ transactions: data, wallets });
            } else {
                reject(new Error(error));
            }
            worker.terminate();
        };

        worker.onerror = (err) => {
            reject(err);
            worker.terminate();
        };

        worker.postMessage(message);
    });
}

function parseCSV(file: File): Promise<ParsedStatement> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const fileData = e.target?.result as string;
            runWorker({
                fileData,
                fileName: file.name,
                fileType: 'csv'
            }).then(resolve).catch(reject);
        };
        reader.onerror = (err) => reject(err);
        reader.readAsText(file);
    });
}

// An Excel export or the expense app's backup: both go to the worker as raw bytes.
function parseBinary(file: File, fileType: 'xlsx' | 'mmbackup'): Promise<ParsedStatement> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const fileData = e.target?.result as ArrayBuffer;
            // Offload the heavy buffer processing to the worker
            // We pass the buffer directly. For max perf we could use transferables [fileData], 
            // but let's stick to simple postMessage first as performance gain comes mainly from off-main-thread.
            runWorker({
                fileData,
                fileName: file.name,
                fileType
            }).then(resolve).catch(reject);
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
}
