// An Excel export has no ids, so its rows get content hashes: the same row in a later export
// gets the same id, until it's edited in the source app. A backup carries the app's own ids,
// which survive edits; its rows keep the hash too, as `exportId`, so links made before backups
// were imported still find them. Trips also use the hash to find a row again after its category
// or note was edited (see findTransactionWithSnapshot in tripUtils).

import type { Transaction } from '../types';

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

export interface IdFields {
    date: string;
    amount: number;
    account: string;
    category: string;
    note: string;
    originalAmount?: number;
}

/** Every id a row answers to: its own and, for a backup row, its export id. */
export const idsOf = (t: Pick<Transaction, 'id' | 'exportId'>): string[] => (t.exportId ? [t.id, t.exportId] : [t.id]);

/** A row's id before repeats are numbered — identical rows become "k3x9", "k3x9_1", "k3x9_2"… */
export const contentId = (t: IdFields): string =>
    generateHash(`${t.date}|${t.amount}|${t.account}|${t.category}|${t.note}|${Number(t.originalAmount || 0)}`);
