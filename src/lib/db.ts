import Dexie, { type Table } from 'dexie';
import type { Transaction } from '../types';

export class GrowMoneyDB extends Dexie {
    transactions!: Table<Transaction>;

    constructor() {
        super('GrowMoneyDB');
        this.version(1).stores({
            transactions: 'id, date, type, category, account'
        });
    }
}

export const db = new GrowMoneyDB();
