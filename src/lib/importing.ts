import type { Transaction } from '../types';
import { idsOf } from './transactionId';

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

const localDateKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "today 14:32", "yesterday 09:10", "12 Sep 14:32", "12 Sep 2025" */
export function formatImportTime(iso: string, now = new Date()): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(d);
    const dayKey = localDateKey(d);
    if (dayKey === localDateKey(now)) return `today ${time}`;
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (dayKey === localDateKey(yesterday)) return `yesterday ${time}`;
    const sameYear = d.getFullYear() === now.getFullYear();
    const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).format(d);
    return sameYear ? `${day} ${time}` : day;
}

/** The menus' note under "Import statement": "Last: yesterday 07:14 · 4,241 rows". */
export const describeLastImport = (meta: ImportMeta, now = new Date()) =>
    `Last: ${formatImportTime(meta.at, now)} · ${meta.count.toLocaleString('en-US')} rows`;

// ---------------------------------------------------------------------------
// What changed between the data on the device and a freshly parsed file.
// A backup's ids are the source app's own, so a row edited there keeps its id.
// An Excel export's ids are content hashes (date|amount|account|category|note|…),
// so there an edited row shows up as one "gone" and one "new". A backup row also
// answers to its export hash, so switching between the two files isn't a whole
// statement gone and new.
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
    const prevIds = new Set(previous.flatMap(idsOf));
    const nextIds = new Set(next.flatMap(idsOf));

    const addedByType = { expense: 0, income: 0, transfer: 0 };
    let added = 0;
    let addedFrom: string | null = null;
    let addedTo: string | null = null;
    let earliestDate: string | null = null;
    let latestDate: string | null = null;

    for (const t of next) {
        if (!earliestDate || t.date < earliestDate) earliestDate = t.date;
        if (!latestDate || t.date > latestDate) latestDate = t.date;
        if (idsOf(t).some(id => prevIds.has(id))) continue;
        added++;
        addedByType[t.type]++;
        if (!addedFrom || t.date < addedFrom) addedFrom = t.date;
        if (!addedTo || t.date > addedTo) addedTo = t.date;
    }

    let removed = 0;
    for (const t of previous) if (!idsOf(t).some(id => nextIds.has(id))) removed++;

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
