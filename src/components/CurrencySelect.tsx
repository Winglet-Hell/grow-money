import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import {
    loadCurrencyCatalogue, searchCurrencies, getCurrencyMeta, normalizeCurrencyCode,
    type CurrencyKind,
} from '../lib/currencies';

interface CurrencySelectProps {
    value: string;
    onChange: (code: string) => void;
    disabled?: boolean;
}

const KIND_LABEL: Record<CurrencyKind, string> = {
    fiat: 'Fiat',
    crypto: 'Crypto',
    metal: 'Metal',
};

const KIND_STYLE: Record<CurrencyKind, string> = {
    fiat: 'bg-gray-100 text-gray-500',
    crypto: 'bg-amber-50 text-amber-600',
    metal: 'bg-violet-50 text-violet-600',
};

/**
 * Searchable currency picker over the whole catalogue (see lib/currencies.ts). Any code
 * can also be typed in by hand, so a currency the rates API has not listed yet is still
 * usable.
 */
export const CurrencySelect: React.FC<CurrencySelectProps> = ({ value, onChange, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [highlight, setHighlight] = useState(0);
    // Bumped once the catalogue lands so the list re-renders with the full set.
    const [catalogueVersion, setCatalogueVersion] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        loadCurrencyCatalogue().then(() => { if (!cancelled) setCatalogueVersion(v => v + 1); });
        return () => { cancelled = true; };
    }, []);

    // Close on outside click / Escape.
    useEffect(() => {
        if (!isOpen) return;
        const onPointerDown = (e: MouseEvent) => {
            if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) inputRef.current?.focus();
        else setQuery('');
    }, [isOpen]);

    const selected = getCurrencyMeta(value);

    const options = useMemo(() => {
        // `keep` makes sure the account's own currency stays listed even if withdrawn.
        const matches = searchCurrencies(query, { keep: [value] }).slice(0, 300);
        const typed = normalizeCurrencyCode(query);
        const isNew = typed.length >= 2 && !matches.some(m => m.code === typed);
        return isNew
            ? [{ ...getCurrencyMeta(typed), custom: true }, ...matches.map(m => ({ ...m, custom: false }))]
            : matches.map(m => ({ ...m, custom: false }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, value, catalogueVersion]);

    useEffect(() => { setHighlight(0); }, [query]);

    // Keep the highlighted row visible while arrowing through a long list.
    useEffect(() => {
        listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)
            ?.scrollIntoView({ block: 'nearest' });
    }, [highlight]);

    const commit = (code: string) => {
        const normalized = normalizeCurrencyCode(code);
        if (!normalized) return;
        onChange(normalized);
        setIsOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { setIsOpen(false); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!options.length) return;
            const delta = e.key === 'ArrowDown' ? 1 : -1;
            setHighlight(h => (h + delta + options.length) % options.length);
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            const option = options[highlight];
            if (option) commit(option.code);
        }
    };

    return (
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setIsOpen(o => !o)}
                className="w-full flex items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white shadow-sm py-2.5 pl-3 pr-2 text-left sm:text-sm transition-all hover:border-emerald-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ WebkitTapHighlightColor: 'transparent' }}
            >
                <span className="min-w-0">
                    <span className="font-medium text-gray-900">{selected.code}</span>
                    <span className="block truncate text-xs text-gray-400">{selected.name}</span>
                </span>
                <ChevronDown className={`w-4 h-4 flex-shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-[19rem] max-w-[calc(100vw-3rem)] rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Code or name — USD, Baht, Solana…"
                            className="w-full text-sm outline-none placeholder:text-gray-400"
                        />
                    </div>

                    <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
                        {options.map((option, index) => (
                            <button
                                key={option.code}
                                type="button"
                                data-index={index}
                                onMouseEnter={() => setHighlight(index)}
                                onClick={() => commit(option.code)}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${index === highlight ? 'bg-emerald-50' : ''
                                    }`}
                            >
                                <span className="font-medium text-gray-900 w-16 flex-shrink-0">{option.code}</span>
                                <span className="flex-1 min-w-0 truncate text-gray-500">
                                    {option.custom ? 'Use this code' : option.name}
                                </span>
                                {!option.custom && (
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${KIND_STYLE[option.kind]}`}>
                                        {KIND_LABEL[option.kind]}
                                    </span>
                                )}
                                {option.code === selected.code && (
                                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                                )}
                            </button>
                        ))}

                        {options.length === 0 && (
                            <p className="px-3 py-6 text-center text-sm text-gray-400">Nothing found</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
