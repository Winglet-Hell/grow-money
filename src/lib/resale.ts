import type { ResalePurchaseEntry, Transaction } from '../types';
import { isGadget, isResaleIncome } from './categoryGroups';
import { DAYS_PER_MONTH, dayNumber } from './milestones';
import { dateKeyOf } from './periods';
import { idsOf } from './transactionId';
import { formatTags } from './utils';

// The Resale page: what a thing cost to own, from the price paid for it to the price it sold
// for. A sale is income in the Resale category; its purchase is the expense whose comment
// names the same item. Both sides are counted in rubles at their own day's rate, so a currency
// move between buying and selling is part of the difference, as it is for the wallet.

/** The words of a comment, lower-cased and sorted: "AirPods Pro 3" and "airpods 3 pro" are one item. */
export function itemKey(note: string): string {
    return (note || '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        // "512GB" and "512 GB" are one size.
        .replace(/(\p{N})(\p{L})/gu, '$1 $2')
        .replace(/(\p{L})(\p{N})/gu, '$1 $2')
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .sort()
        .join(' ');
}

// Only words say what a thing is: "HomePod 2" and "2-in-1 charger" share nothing worth a match.
const wordsOf = (key: string) => key.split(' ').filter(w => /\p{L}/u.test(w));

/** One side of a deal: the purchase or the sale. */
export interface DealSide {
    day: string;   // "YYYY-MM-DD"
    rub: number;   // positive, in rubles
    native?: { amount: number; currency: string }; // what changed hands, when it wasn't rubles
    place: string; // the shop or marketplace (the row's tags), '' when unknown
    tx?: Transaction; // the statement row; a purchase typed in by hand has none
}

/** How a sale found its purchase: by the same comment, picked from the statement, or typed in. */
export type PurchaseSource = 'statement' | 'picked' | 'manual';

/** A sale, before its purchase is known. `key` is what a match made by hand is saved under. */
export interface SaleItem {
    key: string;
    name: string; // the item, as the sale's comment spells it
    sale: DealSide;
}

export interface SoldItem extends SaleItem {
    purchase: DealSide & { source: PurchaseSource };
    days: number;         // owned from the purchase day to the sale day
    difference: number;   // sale − purchase: below zero, what owning it cost
    kept: number | null;  // sale ÷ purchase
    perMonth: number;     // the difference per month of use
}

export interface OwnedItem {
    id: string;
    name: string; // '' when the purchase has no comment
    purchase: DealSide;
    days: number; // owned so far
}

export interface ResaleSummary {
    sold: SoldItem[];         // newest sale first
    unmatched: SaleItem[];    // sold, purchase not found yet; newest first
    owned: OwnedItem[];       // gadgets bought and not sold, newest first
    takenBy: Map<string, string>; // statement purchase id → the key of the sale that took it
    totals: {
        paid: number;
        got: number;
        difference: number;
        kept: number | null;
        perMonth: number | null;
    };
    ownedTotal: number;
}

/** A sale's key: its item, or the row itself when the comment is empty. */
export const saleKey = (t: Transaction) => itemKey(t.note) || `id:${t.id}`;

// Anything kept under a month counts as a month, so a quick resale doesn't read as a monthly
// rate it never ran at.
const monthsOfUse = (days: number) => Math.max(days / DAYS_PER_MONTH, 1);

function sideOf(t: Transaction, day: string): DealSide {
    const foreign = t.originalCurrency && t.originalAmount !== undefined && t.originalCurrency !== (t.currency || 'RUB');
    return {
        day,
        rub: Math.abs(t.amount),
        native: foreign ? { amount: Math.abs(t.originalAmount!), currency: t.originalCurrency! } : undefined,
        place: formatTags(t.tags),
        tx: t,
    };
}

function manualSide(entry: Extract<ResalePurchaseEntry, { date: string }>): DealSide {
    return {
        day: entry.date,
        rub: entry.amount,
        native: entry.price && entry.currency && entry.currency !== 'RUB' ? { amount: entry.price, currency: entry.currency } : undefined,
        place: entry.place ?? '',
    };
}

/** Saved matches as the page can use them: readable ones only. */
export function normalizeResaleEntries(saved: unknown): Record<string, ResalePurchaseEntry> {
    const out: Record<string, ResalePurchaseEntry> = {};
    if (!saved || typeof saved !== 'object') return out;
    for (const [key, raw] of Object.entries(saved as Record<string, unknown>)) {
        if (!raw || typeof raw !== 'object') continue;
        const v = raw as Record<string, unknown>;
        if (typeof v.purchaseId === 'string') {
            out[key] = { purchaseId: v.purchaseId, ...(typeof v.sameAs === 'string' ? { sameAs: v.sameAs } : {}) };
        } else if (
            typeof v.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.date) &&
            typeof v.amount === 'number' && isFinite(v.amount) && v.amount > 0
        ) {
            out[key] = {
                date: v.date,
                amount: v.amount,
                ...(typeof v.price === 'number' && v.price > 0 && typeof v.currency === 'string' ? { price: v.price, currency: v.currency } : {}),
                ...(typeof v.place === 'string' && v.place ? { place: v.place } : {}),
            };
        }
    }
    return out;
}

export function buildResale(transactions: Transaction[], saved: Record<string, ResalePurchaseEntry>, today: string): ResaleSummary {
    const sales: { t: Transaction; day: string; key: string }[] = [];
    const purchases: { t: Transaction; day: string }[] = [];
    for (const t of transactions) {
        const day = dateKeyOf(t.date);
        if (!day) continue;
        if (t.type === 'income' && isResaleIncome(t.category)) sales.push({ t, day, key: saleKey(t) });
        else if (t.type === 'expense') purchases.push({ t, day });
    }
    const byDay = (a: { day: string }, b: { day: string }) => a.day.localeCompare(b.day);
    sales.sort(byDay);
    purchases.sort(byDay);

    const byItem = new Map<string, { t: Transaction; day: string }[]>();
    const byId = new Map<string, { t: Transaction; day: string }>();
    for (const p of purchases) {
        for (const id of idsOf(p.t)) byId.set(id, p);
        const key = itemKey(p.t.note);
        if (!key) continue;
        const list = byItem.get(key);
        if (list) list.push(p); else byItem.set(key, [p]);
    }

    // A purchase goes to one sale only. Of several with the same comment, a sale takes the
    // earliest one still unsold on its day: the old one goes when the new one arrives.
    const takenBy = new Map<string, string>();
    const takeItem = (item: string, day: string, by: string) => {
        const p = byItem.get(item)?.find(c => !takenBy.has(c.t.id) && c.day <= day);
        if (p) takenBy.set(p.t.id, by);
        return p;
    };

    const found = new Map<Transaction, DealSide & { source: PurchaseSource }>();
    // Matches made by hand go first, so a sale with the same comment can't take their purchase.
    for (const s of sales) {
        // A sale without a comment is keyed by its id: by its export id, if matched before backups.
        const entry = saved[s.key] ?? (s.t.exportId && s.key === `id:${s.t.id}` ? saved[`id:${s.t.exportId}`] : undefined);
        if (!entry) continue;
        if ('purchaseId' in entry) {
            const byRow = byId.get(entry.purchaseId);
            const p = byRow && !takenBy.has(byRow.t.id) && byRow.day <= s.day
                ? byRow
                : entry.sameAs ? takeItem(entry.sameAs, s.day, s.key) : undefined;
            if (!p) continue; // the row is gone: back to matching by the sale's own comment
            takenBy.set(p.t.id, s.key);
            found.set(s.t, { ...sideOf(p.t, p.day), source: 'picked' });
        } else if (entry.date <= s.day) {
            found.set(s.t, { ...manualSide(entry), source: 'manual' });
        }
    }
    for (const s of sales) {
        if (found.has(s.t)) continue;
        const p = takeItem(itemKey(s.t.note), s.day, s.key);
        if (p) found.set(s.t, { ...sideOf(p.t, p.day), source: 'statement' });
    }

    const sold: SoldItem[] = [];
    const unmatched: SaleItem[] = [];
    for (const s of sales) {
        const item: SaleItem = { key: s.key, name: s.t.note.trim(), sale: sideOf(s.t, s.day) };
        const purchase = found.get(s.t);
        if (!purchase) {
            unmatched.push(item);
            continue;
        }
        const days = dayNumber(s.day) - dayNumber(purchase.day);
        const difference = item.sale.rub - purchase.rub;
        sold.push({
            ...item,
            purchase,
            days,
            difference,
            kept: purchase.rub > 0 ? item.sale.rub / purchase.rub : null,
            perMonth: difference / monthsOfUse(days),
        });
    }
    sold.reverse();
    unmatched.reverse();

    const owned: OwnedItem[] = purchases
        .filter(p => isGadget(p.t.category) && !takenBy.has(p.t.id))
        .map(p => ({ id: p.t.id, name: p.t.note.trim(), purchase: sideOf(p.t, p.day), days: Math.max(0, dayNumber(today) - dayNumber(p.day)) }))
        .reverse();

    const paid = sold.reduce((sum, s) => sum + s.purchase.rub, 0);
    const got = sold.reduce((sum, s) => sum + s.sale.rub, 0);
    const months = sold.reduce((sum, s) => sum + monthsOfUse(s.days), 0);
    return {
        sold,
        unmatched,
        owned,
        takenBy,
        totals: {
            paid,
            got,
            difference: got - paid,
            kept: paid > 0 ? got / paid : null,
            perMonth: months > 0 ? (got - paid) / months : null,
        },
        ownedTotal: owned.reduce((sum, o) => sum + o.purchase.rub, 0),
    };
}

/** A statement purchase a sale could be, for the "pick it" list. */
export interface PurchaseCandidate {
    id: string;
    key: string;     // its comment's item key, '' when it has none
    name: string;
    side: DealSide;
    shared: number;  // words its comment shares with the sale's
}

/**
 * What a sale's purchase could be, likeliest first: anything bought by the sale day whose
 * comment shares a word with the sale's, then the unsold gadgets. `current` is the purchase
 * the sale already holds, which stays on the list.
 */
export function purchaseCandidates(transactions: Transaction[], summary: ResaleSummary, item: SaleItem, current?: string): PurchaseCandidate[] {
    const saleWords = new Set(wordsOf(item.key.startsWith('id:') ? '' : item.key));
    const out: PurchaseCandidate[] = [];
    for (const t of transactions) {
        if (t.type !== 'expense' || (summary.takenBy.has(t.id) && t.id !== current)) continue;
        const day = dateKeyOf(t.date);
        if (!day || day > item.sale.day) continue;
        const key = itemKey(t.note);
        const shared = wordsOf(key).filter(w => saleWords.has(w)).length;
        if (!shared && !isGadget(t.category) && t.id !== current) continue;
        out.push({ id: t.id, key, name: t.note.trim(), side: sideOf(t, day), shared });
    }
    return out.sort((a, b) => b.shared - a.shared || b.side.day.localeCompare(a.side.day));
}

/** "12 days", "7 mo", "1 yr 3 mo". */
export function formatOwned(days: number): string {
    if (days < 60) return `${days} day${days === 1 ? '' : 's'}`;
    const months = Math.round(days / DAYS_PER_MONTH);
    if (months < 12) return `${months} mo`;
    const years = Math.floor(months / 12);
    const rest = months % 12;
    return rest ? `${years} yr ${rest} mo` : `${years} yr`;
}
