import type { Transaction, Trip, TransactionSnapshot } from '../types';

export const createSnapshot = (t: Transaction): TransactionSnapshot => ({
    date: t.date,
    amount: t.amount,
    category: t.category,
    note: t.note || '',
    originalCurrency: t.originalCurrency
});

export const findTransactionWithSnapshot = (snapshot: TransactionSnapshot, candidates: Transaction[]): Transaction | undefined => {
    return candidates.find(t =>
        t.date === snapshot.date &&
        t.amount === snapshot.amount &&
        t.category === snapshot.category &&
        (t.note || '') === snapshot.note &&
        (t.originalCurrency || '') === (snapshot.originalCurrency || '')
    );
};

export const resolveTripActiveTransactions = (trip: Trip, allTxs: Transaction[]): Transaction[] => {
    const start = trip.startDate;
    const end = trip.endDate;
    const snapshots = trip.transactionSnapshots || {};

    // 1. Base transactions in range
    let candidates = allTxs.filter(t => {
        const txDate = t.date.split('T')[0];
        return txDate >= start && txDate <= end && t.type === 'expense';
    });

    // 2. Add Additional (Recovered via ID or Snapshot)
    (trip.additionalTransactionIds || []).forEach(id => {
        // Check if already in list (avoid duplicates if ID matches)
        if (candidates.some(c => c.id === id)) return;

        // Try to find by ID
        let tx = allTxs.find(t => t.id === id);

        // If not found by ID, try Snapshot
        if (!tx && snapshots[id]) {
            tx = findTransactionWithSnapshot(snapshots[id], allTxs);
        }

        if (tx) {
            // Check if we already have it (resolving duplicates)
            if (!candidates.some(c => c.id === tx!.id)) {
                candidates.push(tx);
            }
        }
    });

    // 3. Apply Exclusions (Recovered via ID or Snapshot)
    const resolvedExcludedIds = new Set<string>();

    trip.excludedTransactionIds.forEach(id => {
        let targetId = id;
        const exists = allTxs.some(t => t.id === id);

        if (!exists && snapshots[id]) {
            const recovered = findTransactionWithSnapshot(snapshots[id], allTxs);
            if (recovered) {
                targetId = recovered.id;
            }
        }
        resolvedExcludedIds.add(targetId);
    });

    return candidates.filter(t => !resolvedExcludedIds.has(t.id));
};
