// Transaction ids are content hashes, so the same row in a later export gets the same id. The
// parser makes them; trips use them to find a row again after its category or note was edited
// in the source app (see findTransactionWithSnapshot in tripUtils).

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

/** A row's id before repeats are numbered — identical rows become "k3x9", "k3x9_1", "k3x9_2"… */
export const contentId = (t: IdFields): string =>
    generateHash(`${t.date}|${t.amount}|${t.account}|${t.category}|${t.note}|${Number(t.originalAmount || 0)}`);
