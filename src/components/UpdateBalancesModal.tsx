import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, AlertTriangle, Clock } from 'lucide-react';
import type { AccountStatus } from '../hooks/useAccounts';
import { cn, formatDate } from '../lib/utils';
import { describeAge, isStale, balanceText } from '../lib/accountFreshness';

interface UpdateBalancesModalProps {
    isOpen: boolean;
    accounts: AccountStatus[];
    onClose: () => void;
    // Persists one wallet's new balance; the modal calls it for every changed row.
    onSaveBalance: (account: AccountStatus, balance: number) => Promise<void>;
    onDone: () => void;
}

// One form for every wallet, so a trip's worth of cash balances can be brought up to
// date in a minute instead of a dialog per wallet. Stale ones come first.
export const UpdateBalancesModal: React.FC<UpdateBalancesModalProps> = ({ isOpen, accounts, onClose, onSaveBalance, onDone }) => {
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

    const ordered = useMemo(() => {
        const rank = (a: AccountStatus) => (isStale(a) ? 0 : !a.isStored ? 1 : 2);
        return [...accounts].sort((a, b) => rank(a) - rank(b) || b.rubEquivalent - a.rubEquivalent || a.name.localeCompare(b.name));
    }, [accounts]);

    useEffect(() => {
        if (!isOpen) return;
        setDrafts(Object.fromEntries(accounts.map(a => [a.id, balanceText(a.current)])));
        setProgress(null);
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
        document.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = 'unset';
            document.removeEventListener('keydown', onKey);
        };
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!isOpen) return null;

    const parse = (v: string) => parseFloat((v || '').replace(/,/g, '.').replace(/\s/g, ''));
    const changed = ordered.filter(a => {
        const v = parse(drafts[a.id] ?? '');
        return !isNaN(v) && v !== a.current;
    });

    const handleSave = async () => {
        if (changed.length === 0) { onClose(); return; }
        setSaving(true);
        setProgress({ done: 0, total: changed.length });
        try {
            for (let i = 0; i < changed.length; i++) {
                await onSaveBalance(changed[i], parse(drafts[changed[i].id]));
                setProgress({ done: i + 1, total: changed.length });
            }
            onDone();
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={saving ? undefined : onClose} />

            <div className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-2xl">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">Update balances</h3>
                        <p className="text-xs text-gray-500">Type the real balance of each wallet. Untouched rows are left as they are.</p>
                    </div>
                    <button onClick={onClose} disabled={saving} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                    {ordered.map(a => {
                        const stale = isStale(a);
                        const age = describeAge(a.balance_date);
                        const draft = drafts[a.id] ?? '';
                        const v = parse(draft);
                        const isChanged = !isNaN(v) && v !== a.current;
                        return (
                            <label key={a.id} className={cn("flex items-center gap-3 px-6 py-3 cursor-text", isChanged && "bg-emerald-50/40")}>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-gray-900 truncate">{a.name}</div>
                                    <div className="text-xs text-gray-400 flex flex-wrap items-center gap-x-2">
                                        {!a.isStored
                                            ? <span>not entered yet</span>
                                            : age
                                                ? <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {age}</span>
                                                : <span>date unknown</span>}
                                        {stale && (
                                            <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                                                <AlertTriangle className="w-3 h-3" /> {a.txSinceBalance} ops since
                                            </span>
                                        )}
                                        {a.lastActivity && <span>· last op {formatDate(a.lastActivity)}</span>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={draft}
                                        disabled={saving}
                                        onChange={e => setDrafts(prev => ({ ...prev, [a.id]: e.target.value }))}
                                        onFocus={e => e.target.select()}
                                        className={cn(
                                            "w-32 sm:w-40 text-right rounded-lg border px-3 py-2 text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500",
                                            isChanged ? "border-emerald-400 text-emerald-800" : "border-gray-200 text-gray-900"
                                        )}
                                    />
                                    <span className="w-12 text-xs font-semibold text-gray-400">{a.currency}</span>
                                </div>
                            </label>
                        );
                    })}
                </div>

                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex items-center gap-3">
                    <span className="text-xs text-gray-500 flex-1">
                        {progress
                            ? `Saving ${progress.done} of ${progress.total}…`
                            : changed.length
                                ? `${changed.length} wallet${changed.length === 1 ? '' : 's'} changed`
                                : 'Nothing changed yet'}
                    </span>
                    <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || changed.length === 0}
                        className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        Save {changed.length > 0 ? changed.length : ''}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
