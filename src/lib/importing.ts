import type { Transaction } from '../types';

// ---------------------------------------------------------------------------
// Last-import bookkeeping. Lives next to the transactions (same device, same
// origin) in localStorage; cleared together with them.
// ---------------------------------------------------------------------------

export interface ImportMeta {
    at: string;                // ISO timestamp of the import
    count: number;             // rows imported
    fileName?: string;
    latestDate: string | null; // newest transaction date in the file ("YYYY-MM-DD")
}

const META_KEY = 'growmoney:lastImport';

export function readImportMeta(): ImportMeta | null {
    try {
        const raw = localStorage.getItem(META_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed.at === 'string' && typeof parsed.count === 'number' ? parsed : null;
    } catch {
        return null;
    }
}

export function writeImportMeta(meta: ImportMeta): void {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* storage blocked */ }
}

export function clearImportMeta(): void {
    try { localStorage.removeItem(META_KEY); } catch { /* storage blocked */ }
}

// ---------------------------------------------------------------------------
// What changed between the data on the device and a freshly parsed file.
// Transaction ids are content hashes (date|amount|account|category|note|…), so
// a row that is byte-for-byte the same in both exports keeps its id. A row
// edited in the source app therefore shows up as one "gone" and one "new".
// ---------------------------------------------------------------------------

export interface ImportSummary {
    total: number;
    previousTotal: number;
    added: number;
    removed: number;
    addedByType: { expense: number; income: number; transfer: number };
    earliestDate: string | null;   // whole file
    latestDate: string | null;     // whole file
    addedFrom: string | null;      // date range of the new rows
    addedTo: string | null;
    // True when the file is a lot smaller than what is already imported — most
    // likely the wrong file, since the source app always exports full history.
    looksTruncated: boolean;
}

export function summarizeImport(previous: Transaction[], next: Transaction[]): ImportSummary {
    const prevIds = new Set(previous.map(t => t.id));
    const nextIds = new Set(next.map(t => t.id));

    const addedByType = { expense: 0, income: 0, transfer: 0 };
    let added = 0;
    let addedFrom: string | null = null;
    let addedTo: string | null = null;
    let earliestDate: string | null = null;
    let latestDate: string | null = null;

    for (const t of next) {
        if (!earliestDate || t.date < earliestDate) earliestDate = t.date;
        if (!latestDate || t.date > latestDate) latestDate = t.date;
        if (prevIds.has(t.id)) continue;
        added++;
        addedByType[t.type]++;
        if (!addedFrom || t.date < addedFrom) addedFrom = t.date;
        if (!addedTo || t.date > addedTo) addedTo = t.date;
    }

    let removed = 0;
    for (const id of prevIds) if (!nextIds.has(id)) removed++;

    return {
        total: next.length,
        previousTotal: previous.length,
        added,
        removed,
        addedByType,
        earliestDate,
        latestDate,
        addedFrom,
        addedTo,
        looksTruncated: previous.length > 0 && next.length < previous.length * 0.9,
    };
}
