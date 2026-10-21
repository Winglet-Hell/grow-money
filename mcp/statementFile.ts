import type { BackupExtras, Transaction } from '../src/types';

// What a statement is, wherever it was read from: the newest file in ~/Downloads (the local server,
// lib statement.ts) or the copy the app keeps in the account (the online server, cloud.ts).

export interface StatementFile {
    path: string;
    name: string;
    kind: 'backup' | 'excel';
    madeAt: string | null;       // when the expense app made it, read off the name: "2026-10-18 17:36"
    modified: string;            // the file's own time, or when it was imported into the app; ISO
    size: number;
    storedIn: 'downloads' | 'account';
}

export interface Statement {
    file: StatementFile;
    transactions: Transaction[]; // newest first, as the app keeps them
    backup?: Omit<BackupExtras, 'photos'>; // a backup's wallets with their history, and its categories; photos are the app's alone
}

// The app names both kinds by the moment it made them: 2026_10_18_17_36_01_123747.mmbackup.
const MADE_AT = /^(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_\d+(?: \(\d+\))?\.[a-z]+$/i;

/** "2026-10-18 17:36" for a file named the expense app's way, else null. */
export function madeAtOf(name: string): string | null {
    const m = MADE_AT.exec(name);
    return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : null;
}

export const kindOf = (name: string): StatementFile['kind'] => (/\.mmbackup$/i.test(name) ? 'backup' : 'excel');
