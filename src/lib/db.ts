import Dexie, { type Table } from 'dexie';
import type { Transaction, Trip } from '../types';

export class GrowMoneyDB extends Dexie {
    transactions!: Table<Transaction>;
    trips!: Table<Trip>;

    constructor() {
        super('GrowMoneyDB');
        this.version(2).stores({
            transactions: 'id, date, type, category, account',
            trips: 'id, name, startDate, endDate'
        });
    }
}

export const db = new GrowMoneyDB();
