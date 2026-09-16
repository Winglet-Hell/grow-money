import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertTriangle, XCircle, FileSpreadsheet, Wallet, X } from 'lucide-react';
import type { Transaction } from '../types';
import type { ImportSummary } from '../lib/importing';
import { formatDate } from '../lib/utils';

// One import runs through these states; App.tsx owns the machine, this only renders it.
export type ImportState =
    | { status: 'idle' }
    | { status: 'parsing'; fileName: string }
    | { status: 'confirm'; fileName: string; summary: ImportSummary; data: Transaction[] }
    | { status: 'applying'; fileName: string }
    | { status: 'done'; fileName: string; summary: ImportSummary; newAccounts: string[] }
    | { status: 'error'; fileName: string; message: string };

interface ImportStatementDialogProps {
    state: ImportState;
    onClose: () => void;
    onRetry: () => void;            // open the file picker again
    onConfirmReplace: () => void;   // "confirm" state: go ahead with the smaller file
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export const ImportStatementDialog: React.FC<ImportStatementDialogProps> = ({ state, onClose, onRetry, onConfirmReplace }) => {
    const busy = state.status === 'parsing' || state.status === 'applying';
    const isOpen = state.status !== 'idle';

    useEffect(() => {
        if (!isOpen) return;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !busy) onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = 'unset';
            document.removeEventListener('keydown', onKey);
        };
    }, [isOpen, busy, onClose]);

    if (!isOpen) return null;

    let body: React.ReactNode;
    let footer: React.ReactNode = null;

    if (state.status === 'parsing' || state.status === 'applying') {
        body = (
            <div className="flex flex-col items-center text-center gap-4 py-6">
                <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
                <div>
                    <p className="font-semibold text-gray-900">
                        {state.status === 'parsing' ? 'Reading the statement…' : 'Saving on this device…'}
                    </p>
                    <p className="text-sm text-gray-500 mt-1 break-all">{state.fileName}</p>
                </div>
                <p className="text-xs text-gray-400">Parsed locally — the file is never uploaded anywhere.</p>
            </div>
        );
    } else if (state.status === 'confirm') {
        const { summary } = state;
        body = (
            <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="space-y-2 text-sm text-gray-600">
                    <p className="text-base font-semibold text-gray-900">This file is much smaller than your current data</p>
                    <p>
                        <span className="font-medium text-gray-900">{summary.total.toLocaleString('en-US')}</span> rows in the file
                        against <span className="font-medium text-gray-900">{summary.previousTotal.toLocaleString('en-US')}</span> imported now.
                        The source app exports the full history, so this is probably not the latest export.
                    </p>
                    <p>Replacing would drop {plural(summary.removed, 'transaction', 'transactions')} that are not in this file.</p>
                </div>
            </div>
        );
        footer = (
            <>
                <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                    Keep current data
                </button>
                <button onClick={onConfirmReplace} className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors shadow-sm">
                    Replace anyway
                </button>
            </>
        );
    } else if (state.status === 'done') {
        const { summary, newAccounts } = state;
        const nothingNew = summary.added === 0 && summary.removed === 0;
        const typeBits = [
            summary.addedByType.expense > 0 && plural(summary.addedByType.expense, 'expense', 'expenses'),
            summary.addedByType.income > 0 && plural(summary.addedByType.income, 'income', 'incomes'),
            summary.addedByType.transfer > 0 && plural(summary.addedByType.transfer, 'transfer', 'transfers'),
        ].filter(Boolean).join(' · ');

        body = (
            <div className="space-y-5">
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-base font-semibold text-gray-900">Statement imported</p>
                        <p className="text-sm text-gray-500 flex items-center gap-1.5 min-w-0">
                            <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{state.fileName}</span>
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                    <Stat label="Transactions" value={summary.total.toLocaleString('en-US')} />
                    <Stat
                        label="New"
                        value={summary.added > 0 ? `+${summary.added.toLocaleString('en-US')}` : '0'}
                        tone={summary.added > 0 ? 'good' : 'muted'}
                    />
                    <Stat
                        label="Gone"
                        value={summary.removed.toLocaleString('en-US')}
                        tone={summary.removed > 0 ? 'warn' : 'muted'}
                    />
                </div>

                <div className="text-sm text-gray-600 space-y-1.5">
                    {nothingNew ? (
                        <p>Nothing new — the file matches what was already imported.</p>
                    ) : (
                        <>
                            {summary.added > 0 && (
                                <p>
                                    New rows{summary.addedFrom && summary.addedTo && (
                                        <>: {formatDate(summary.addedFrom)}{summary.addedFrom !== summary.addedTo && <> – {formatDate(summary.addedTo)}</>}</>
                                    )}{typeBits && <span className="text-gray-400"> · {typeBits}</span>}
                                </p>
                            )}
                            {summary.removed > 0 && (
                                <p className="text-gray-500">
                                    {plural(summary.removed, 'row', 'rows')} from the previous import {summary.removed === 1 ? 'is' : 'are'} not in this file —
                                    edited or deleted in the source app.
                                </p>
                            )}
                        </>
                    )}
                    {summary.earliestDate && summary.latestDate && (
                        <p className="text-gray-400">Data range: {formatDate(summary.earliestDate)} – {formatDate(summary.latestDate)}</p>
                    )}
                </div>

                {newAccounts.length > 0 && (
                    <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-800 flex items-start gap-3">
                        <Wallet className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                        <div className="min-w-0">
                            <p className="font-medium">{plural(newAccounts.length, 'new wallet', 'new wallets')} found: {newAccounts.join(', ')}</p>
                            <p className="text-emerald-700/80">
                                Balances start at 0 —{' '}
                                <Link to="/accounts" onClick={onClose} className="underline font-medium">set them on the Wallets page</Link>.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        );
        footer = (
            <button onClick={onClose} autoFocus className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm">
                Done
            </button>
        );
    } else if (state.status === 'error') {
        body = (
            <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
                    <XCircle className="w-5 h-5" />
                </div>
                <div className="space-y-2 text-sm text-gray-600 min-w-0">
                    <p className="text-base font-semibold text-gray-900">Couldn't read the file</p>
                    <p className="break-all text-gray-500">{state.fileName}</p>
                    <p className="text-red-600">{state.message}</p>
                    <p className="text-gray-400">Your current data was left untouched.</p>
                </div>
            </div>
        );
        footer = (
            <>
                <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                    Close
                </button>
                <button onClick={onRetry} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm">
                    Choose another file
                </button>
            </>
        );
    }

    return createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={busy ? undefined : onClose} />

            <div
                role="dialog"
                aria-modal="true"
                aria-busy={busy}
                className="relative w-full max-w-md bg-white rounded-2xl shadow-xl animate-in fade-in zoom-in-95 duration-200"
            >
                {!busy && (
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="absolute top-3 right-3 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
                <div className="p-6">{body}</div>
                {footer && (
                    <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex justify-end gap-3">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

function Stat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'good' | 'warn' | 'muted' }) {
    const color = tone === 'good' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : tone === 'muted' ? 'text-gray-400' : 'text-gray-900';
    return (
        <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</div>
            <div className={`text-lg font-bold ${color}`}>{value}</div>
        </div>
    );
}
