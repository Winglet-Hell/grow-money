import React, { useEffect, useRef, useState } from 'react';
import { Wallet, Bitcoin, Landmark, Banknote, CreditCard, DollarSign, Pencil, Check, X, Loader2, AlertTriangle } from 'lucide-react';
import type { AccountStatus } from '../hooks/useAccounts';
import { cn, formatDate } from '../lib/utils';
import { formatCurrencyAmount } from '../lib/currencies';
import { describeAge, isStale, balanceText } from '../lib/accountFreshness';

interface WalletRowProps {
    account: AccountStatus;
    share: number; // of total net worth, 0–1
    isPrivacyMode: boolean;
    canEdit: boolean;
    onEdit: (account: AccountStatus) => void;
    onSaveBalance: (account: AccountStatus, balance: number) => Promise<void>;
}

const rub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });

// Shared column template: icon · wallet · balance · ≈ RUB · share · updated · activity · actions.
export const WALLET_GRID = 'md:grid-cols-[2rem_minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_2.5rem]';

const TypeIcon = ({ type, className }: { type: string; className?: string }) => {
    const props = { className: cn('w-4 h-4', className), strokeWidth: 2 };
    switch (type) {
        case 'wallet': return <Wallet {...props} />;
        case 'crypto': return <Bitcoin {...props} />;
        case 'bank': return <Landmark {...props} />;
        case 'cash': return <Banknote {...props} />;
        case 'card': return <CreditCard {...props} />;
        default: return <DollarSign {...props} />;
    }
};

// A module-level component (not defined inside the page) so React keeps the row and its
// inline-edit state across parent re-renders — rates and balances refresh often.
export const WalletRow: React.FC<WalletRowProps> = ({ account, share, isPrivacyMode, canEdit, onEdit, onSaveBalance }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    // Enter commits and unmounts the input, which can fire blur → commit a second time.
    const committedRef = useRef(false);

    useEffect(() => {
        if (editing) inputRef.current?.select();
    }, [editing]);

    // Rubles read like everywhere else in the app; other currencies keep their own style.
    const native = (n: number) => (isPrivacyMode ? '••••' : account.currency === 'RUB' ? rub.format(n) : formatCurrencyAmount(n, account.currency));
    const money = (n: number) => (isPrivacyMode ? '••••' : rub.format(n));
    const isEmpty = account.current === 0;
    const stale = isStale(account);
    const age = describeAge(account.balance_date);

    const startEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!canEdit || saving) return;
        setDraft(balanceText(account.current));
        committedRef.current = false;
        setEditing(true);
    };
    const cancel = () => { committedRef.current = true; setEditing(false); };
    const commit = async () => {
        if (committedRef.current) return;
        committedRef.current = true;
        const value = parseFloat(draft.replace(/,/g, '.').replace(/\s/g, ''));
        setEditing(false);
        if (isNaN(value) || value === account.current) return;
        setSaving(true);
        try { await onSaveBalance(account, value); } finally { setSaving(false); }
    };
    const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    };

    return (
        <div
            className={cn(
                "grid grid-cols-[2rem_minmax(0,1fr)_auto_2rem] items-center gap-x-3 px-4 md:px-6 py-2.5 border-b border-gray-100 last:border-0 transition-colors",
                WALLET_GRID,
                isEmpty ? "text-gray-400" : "hover:bg-gray-50/70",
                stale && !isEmpty && "bg-amber-50/40 hover:bg-amber-50/70"
            )}
        >
            {/* Icon */}
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", isEmpty ? "bg-gray-100 text-gray-300" : "bg-emerald-50 text-emerald-600")}>
                <TypeIcon type={account.type} />
            </div>

            {/* Wallet */}
            <div className="min-w-0">
                <div className={cn("font-medium truncate", isEmpty ? "text-gray-500" : "text-gray-900")} title={account.name}>{account.name}</div>
                <div className="text-xs text-gray-400 truncate">
                    {account.currency}
                    {!account.hasRate && account.currency !== 'RUB' && <span className="text-amber-600"> · no rate</span>}
                    {/* On phones the second line carries what the hidden columns would say. */}
                    <span className="md:hidden">
                        {account.isStored
                            ? (age ? ` · updated ${age}` : ' · date unknown')
                            : ' · balance not entered'}
                        {stale && <span className="text-amber-600 font-medium"> · {account.txSinceBalance} ops since</span>}
                    </span>
                </div>
            </div>

            {/* Balance (editable) */}
            <div className="text-right md:order-none">
                {editing ? (
                    <div className="flex items-center justify-end gap-1">
                        <input
                            ref={inputRef}
                            type="text"
                            inputMode="decimal"
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={onKey}
                            onBlur={commit}
                            aria-label={`New balance for ${account.name} in ${account.currency}`}
                            className="w-28 sm:w-32 text-right font-semibold text-gray-900 bg-white border border-emerald-400 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 tabular-nums"
                        />
                        <button type="button" onMouseDown={e => e.preventDefault()} onClick={commit} className="p-1 rounded-md bg-emerald-50 text-emerald-600 hover:bg-emerald-100" aria-label="Save"><Check className="w-3.5 h-3.5" /></button>
                        <button type="button" onMouseDown={e => e.preventDefault()} onClick={cancel} className="p-1 rounded-md text-gray-400 hover:bg-gray-100" aria-label="Cancel"><X className="w-3.5 h-3.5" /></button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={startEdit}
                        disabled={!canEdit || saving}
                        title={canEdit ? 'Click to change the balance' : undefined}
                        className={cn(
                            "font-semibold tabular-nums rounded-md px-1.5 -mx-1.5 py-0.5 text-right transition-colors whitespace-nowrap",
                            account.current < 0 ? "text-red-500" : isEmpty ? "text-gray-400" : "text-gray-900",
                            canEdit && "hover:bg-emerald-50 cursor-text"
                        )}
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin text-emerald-500 inline" /> : native(account.current)}
                    </button>
                )}
                <div className="text-xs text-gray-400 tabular-nums md:hidden">
                    {account.currency !== 'RUB' && account.hasRate ? `≈ ${money(account.rubEquivalent)}` : ''}
                </div>
            </div>

            {/* ≈ RUB */}
            <div className="hidden md:block text-right text-sm text-gray-600 tabular-nums">
                {account.hasRate ? money(account.rubEquivalent) : <span className="text-amber-600 text-xs">not valued</span>}
            </div>

            {/* Share of net worth */}
            <div className="hidden md:flex items-center gap-2" title={`${(share * 100).toFixed(1)}% of net worth`}>
                <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, share * 100)}%` }} />
                </div>
                <span className="text-xs text-gray-500 tabular-nums w-9 text-right">{share >= 0.005 ? `${Math.round(share * 100)}%` : share > 0 ? '<1%' : '—'}</span>
            </div>

            {/* Updated */}
            <div className="hidden md:block text-xs">
                {!account.isStored ? (
                    <span className="text-gray-400">not entered yet</span>
                ) : (
                    <>
                        <div className={cn(age ? "text-gray-600" : "text-gray-400")}>{age ? `${age}` : 'date unknown'}</div>
                        {stale && (
                            <div
                                className="text-amber-600 font-medium inline-flex items-center gap-1"
                                title={`${account.txSinceBalance} operations dated after the balance was entered — the real balance has probably moved.`}
                            >
                                <AlertTriangle className="w-3 h-3" /> {account.txSinceBalance} ops since
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Activity */}
            <div className="hidden md:block text-xs text-gray-500 tabular-nums">
                {account.txCount > 0
                    ? <><div>{account.txCount.toLocaleString('en-US')} ops</div>{account.lastActivity && <div className="text-gray-400">last {formatDate(account.lastActivity)}</div>}</>
                    : <span className="text-gray-300">—</span>}
            </div>

            {/* Actions */}
            <div className="flex justify-end">
                {canEdit && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onEdit(account); }}
                        className="p-1.5 text-gray-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                        title="Edit wallet"
                        aria-label={`Edit ${account.name}`}
                    >
                        <Pencil className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
};
