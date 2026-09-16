import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    description?: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    // "danger" paints the confirm button red — use it for anything that deletes data.
    tone?: 'danger' | 'default';
    isBusy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

// Small modal for one-shot "are you sure?" questions. Replaces window.confirm so the
// dialog matches the app's look and works the same on iOS (which ignores window.confirm
// styling and, in PWA mode, sometimes suppresses it entirely).
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen,
    title,
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    tone = 'default',
    isBusy = false,
    onConfirm,
    onCancel,
}) => {
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isBusy) onCancel();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, isBusy, onCancel]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={isBusy ? undefined : onCancel}
            />

            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl animate-in fade-in zoom-in-95 duration-200"
            >
                <div className="p-6 space-y-4">
                    <div className="flex items-start gap-4">
                        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${tone === 'danger' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'}`}>
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div className="space-y-1 min-w-0">
                            <h3 id="confirm-dialog-title" className="text-lg font-semibold text-gray-900 leading-snug">
                                {title}
                            </h3>
                            {description && (
                                <div className="text-sm text-gray-500 leading-relaxed">{description}</div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isBusy}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isBusy}
                        autoFocus
                        className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${tone === 'danger'
                            ? 'bg-red-600 hover:bg-red-700'
                            : 'bg-emerald-600 hover:bg-emerald-700'}`}
                    >
                        {isBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
