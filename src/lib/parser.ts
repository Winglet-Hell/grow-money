import type { Transaction } from '../types';
import ParserWorker from './parser.worker?worker';

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

function runWorker(message: any): Promise<Transaction[]> {
    return new Promise((resolve, reject) => {
        const worker = new ParserWorker();

        worker.onmessage = (e) => {
            const { status, data, error } = e.data;
            if (status === 'success') {
                resolve(data);
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

function parseCSV(file: File): Promise<Transaction[]> {
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

function parseExcel(file: File): Promise<Transaction[]> {
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
                fileType: 'xlsx'
            }).then(resolve).catch(reject);
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
}
