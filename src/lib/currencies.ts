import {
    METAL_CODES, EXTRA_FIAT_CODES, LEGACY_CODES, ALIAS_CODES, POPULAR_CODES,
    FALLBACK_NAMES, EXTRA_CRYPTO_CODES, AMBIGUOUS_CODES,
} from './currencyData';

// One catalogue of every currency the app knows about, assembled at runtime.
//
// Codes and names come from currency-api's /currencies.json — the same service that
// supplies the rates — so anything it starts listing becomes selectable without a
// release. Fiat is told apart from tokens with Intl's own ISO 4217 table, corrected by
// the small overrides in currencyData.ts.

export type CurrencyKind = 'fiat' | 'crypto' | 'metal';

export interface CurrencyMeta {
    code: string;
    name: string;
    kind: CurrencyKind;
    legacy: boolean;   // withdrawn from circulation; kept only for old records
    hasRate: boolean;  // a RUB rate is available, so balances can be valued
}

const CATALOGUE_URL = 'https://latest.currency-api.pages.dev/v1/currencies.json';

const ISO_CODES: Set<string> = (() => {
    try {
        // ES2022. Gives ~159 live ISO 4217 codes without shipping the table ourselves.
        // Typed locally because the DOM lib in use does not declare it yet.
        const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
        return new Set(intl.supportedValuesOf?.('currency') ?? []);
    } catch {
        return new Set<string>();
    }
})();

const LEGACY = new Set(LEGACY_CODES);
const METALS = new Set(METAL_CODES);
const EXTRA_FIAT = new Set(EXTRA_FIAT_CODES);

const names = new Map<string, string>();
const ratedCodes = new Set<string>();
const knownCodes = new Set<string>();

function classify(code: string): CurrencyKind {
    if (METALS.has(code)) return 'metal';
    if (ISO_CODES.has(code) || EXTRA_FIAT.has(code) || LEGACY.has(code)) return 'fiat';
    // Intl's table has no live entry, and it is not one of ours — treat it as a token.
    return 'crypto';
}

function titleCase(code: string) {
    return code.charAt(0) + code.slice(1).toLowerCase();
}

/** Upper-cases and resolves aliases; returns '' for anything that cannot be a code. */
export function normalizeCurrencyCode(input: string): string {
    const code = (input || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code || code.length < 2 || code.length > 10) return '';
    return ALIAS_CODES[code] || code;
}

export function getCurrencyMeta(input: string): CurrencyMeta {
    const code = normalizeCurrencyCode(input) || (input || '').toUpperCase();
    return {
        code,
        name: names.get(code) || FALLBACK_NAMES[code] || titleCase(code),
        kind: classify(code),
        legacy: LEGACY.has(code),
        hasRate: code === 'RUB' || ratedCodes.has(code),
    };
}

export const isCryptoCode = (code: string) => getCurrencyMeta(code).kind === 'crypto';

/** Seeds the catalogue from currency-api's code → name map. */
export function registerCurrencyNames(raw: Record<string, string>) {
    for (const [rawCode, rawName] of Object.entries(raw || {})) {
        const code = normalizeCurrencyCode(rawCode);
        if (!code) continue;
        knownCodes.add(code);
        // The API leaves a few names blank; keep whatever we already had in that case.
        if (rawName && rawName.trim()) names.set(code, rawName.trim());
    }
}

/** Records which codes actually have a RUB rate, so unpriced ones can be flagged. */
export function registerRateCodes(codes: string[]) {
    for (const raw of codes) {
        const code = normalizeCurrencyCode(raw);
        if (!code) continue;
        knownCodes.add(code);
        ratedCodes.add(code);
    }
}

let cataloguePromise: Promise<void> | null = null;

/** Fetches the full catalogue once per session; safe to call from anywhere. */
export function loadCurrencyCatalogue(): Promise<void> {
    if (!cataloguePromise) {
        cataloguePromise = fetch(CATALOGUE_URL)
            .then(res => res.json())
            .then(data => { if (data && typeof data === 'object') registerCurrencyNames(data); })
            .catch(err => {
                console.error('Failed to load currency catalogue:', err);
                cataloguePromise = null; // allow a later retry
            });
    }
    return cataloguePromise;
}

// Seed synchronously so the pickers are complete on first paint: every live ISO currency
// from Intl, plus the tokens we care about. The fetched catalogue then fills in the
// remaining tokens and the proper display names.
ISO_CODES.forEach(c => knownCodes.add(c));
EXTRA_FIAT_CODES.forEach(c => knownCodes.add(c));
METAL_CODES.forEach(c => knownCodes.add(c));
Object.keys(FALLBACK_NAMES).forEach(c => knownCodes.add(c));
EXTRA_CRYPTO_CODES.forEach(c => knownCodes.add(c));
POPULAR_CODES.forEach(c => knownCodes.add(c));

const KIND_ORDER: Record<CurrencyKind, number> = { fiat: 0, crypto: 1, metal: 2 };

export interface CurrencyListOptions {
    includeLegacy?: boolean;
    /** Always keep these in the result even if they would be filtered out. */
    keep?: string[];
}

export function getCurrencies({ includeLegacy = false, keep = [] }: CurrencyListOptions = {}): CurrencyMeta[] {
    const kept = new Set(keep.map(normalizeCurrencyCode).filter(Boolean));
    return Array.from(knownCodes)
        .map(getCurrencyMeta)
        .filter(m => includeLegacy || !m.legacy || kept.has(m.code))
        .sort((a, b) => {
            const pa = POPULAR_CODES.indexOf(a.code);
            const pb = POPULAR_CODES.indexOf(b.code);
            if (pa !== pb) return (pa < 0 ? 999 : pa) - (pb < 0 ? 999 : pb);
            return KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.code.localeCompare(b.code);
        });
}

/** Ranked search over codes and names. An exact code match always wins. */
export function searchCurrencies(query: string, options: CurrencyListOptions = {}): CurrencyMeta[] {
    const all = getCurrencies(options);
    const q = (query || '').trim().toLowerCase();
    if (!q) return all;

    const scored: { meta: CurrencyMeta; score: number; rank: number }[] = [];
    all.forEach((meta, rank) => {
        const code = meta.code.toLowerCase();
        const name = meta.name.toLowerCase();
        let score = -1;
        if (code === q) score = 0;
        else if (code.startsWith(q)) score = 1;
        else if (name.startsWith(q)) score = 2;
        else if (name.includes(q)) score = 3;
        else if (code.includes(q)) score = 4;
        // `rank` preserves the catalogue order (popular first) within a score band.
        if (score >= 0) scored.push({ meta, score, rank });
    });
    return scored
        .sort((a, b) => a.score - b.score || a.rank - b.rank)
        .map(s => s.meta);
}

/**
 * Picks a currency out of an account name ("Cash KRW" → KRW). Codes that are also
 * ordinary words are ignored, so "All cash" is not read as Albanian Lek.
 */
export function inferCurrencyFromName(name: string): string | null {
    for (const token of (name || '').split(/[^A-Za-z0-9]+/)) {
        if (token.length < 3) continue;
        const code = normalizeCurrencyCode(token);
        if (!code || AMBIGUOUS_CODES.has(code) || LEGACY.has(code)) continue;
        // ISO_CODES is available synchronously, so names resolve even before the
        // catalogue has been fetched.
        if (knownCodes.has(code) || ISO_CODES.has(code)) return code;
    }
    return null;
}

/**
 * Formats a balance. Fiat keeps whole units (that is how the cards read); tokens and
 * metals keep up to 8 decimals so a small-but-valuable holding never renders as "0".
 */
export function formatCurrencyAmount(amount: number, code: string): string {
    const meta = getCurrencyMeta(code);
    const abs = Math.abs(amount);

    if (meta.kind === 'fiat') {
        try {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: meta.code,
                maximumFractionDigits: abs === 0 || abs >= 1 ? 0 : 4,
            }).format(amount);
        } catch {
            // Not a code Intl accepts — fall through to the suffixed form.
        }
    }

    const maximumFractionDigits = abs === 0 ? 0 : abs >= 1000 ? 2 : 8;
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(amount)} ${meta.code}`;
}

/**
 * Renders "how much is one unit worth". Rates below a kopeck are quoted the other way
 * round, because "0,00 ₽" tells the reader nothing (VND is ≈0.003 ₽).
 */
export function formatRubRate(rate: number, code: string): string {
    if (!isFinite(rate) || rate <= 0) return '—';

    if (rate < 0.1) {
        const per = 1 / rate;
        const perFormatted = new Intl.NumberFormat('ru-RU', {
            maximumFractionDigits: per >= 100 ? 0 : 2,
        }).format(per);
        return `1 ₽ = ${perFormatted} ${code}`;
    }

    const digits = rate >= 1000 ? 0 : 2;
    return rate.toLocaleString('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
}
