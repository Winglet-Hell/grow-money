import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X } from 'lucide-react';
import type { Milestone, MilestoneKind } from '../types';
import { MILESTONE_KINDS, formatDayKey as formatDay, todayKey } from '../lib/milestones';
import { cn } from '../lib/utils';

interface MilestoneModalProps {
    milestone: Milestone | null; // null adds a new one
    initialDate?: string;        // a new one's starting day (today when not given)
    statement: { first: string | null; last: string | null }; // days the imported statement covers
    onSave: (milestone: Milestone) => void;
    onDelete: (milestone: Milestone) => void; // asks for confirmation upstream
    onClose: () => void;
}

// Mounted only while open, so every opening starts from the milestone it was given.
export function MilestoneModal({ milestone, initialDate, statement, onSave, onDelete, onClose }: MilestoneModalProps) {
    const [title, setTitle] = useState(milestone?.title ?? '');
    const [date, setDate] = useState(milestone?.date ?? initialDate ?? todayKey());
    const [kind, setKind] = useState<MilestoneKind>(milestone?.kind ?? 'other');
    const [note, setNote] = useState(milestone?.note ?? '');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', onKey);
        };
    }, [onClose]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const cleanTitle = title.trim();
        if (!cleanTitle) {
            setError('Give the milestone a name');
            return;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            setError('Pick the day it happened');
            return;
        }
        const cleanNote = note.trim();
        onSave({
            id: milestone?.id ?? crypto.randomUUID(),
            date,
            title: cleanTitle,
            kind,
            ...(cleanNote ? { note: cleanNote } : {}),
        });
    };

    const outside =
        statement.first && date < statement.first
            ? `Earlier than your statement, which starts ${formatDay(statement.first)} — the time before it has no figures.`
            : statement.last && date > statement.last
                ? `After your latest data (${formatDay(statement.last)}) — its chapter fills in as newer statements come in.`
                : null;

    const inputClass = "w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all placeholder:text-gray-400";

    return createPortal(
        <div className="fixed inset-0 z-[100] overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
                <form
                    onSubmit={submit}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="milestone-modal-title"
                    className="relative z-10 w-full max-w-xl bg-white rounded-2xl shadow-xl animate-in fade-in zoom-in-95 duration-200"
                >
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 rounded-t-2xl">
                        <h3 id="milestone-modal-title" className="text-lg font-semibold text-gray-900">
                            {milestone ? 'Edit milestone' : 'New milestone'}
                        </h3>
                        <button type="button" onClick={onClose} aria-label="Close" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6 space-y-5">
                        <div>
                            <label htmlFor="milestone-title" className="block text-sm font-medium text-gray-700 mb-1.5">What happened</label>
                            <input
                                id="milestone-title"
                                type="text"
                                value={title}
                                maxLength={60}
                                onChange={e => { setTitle(e.target.value); setError(null); }}
                                placeholder="Moved to Bangkok"
                                className={cn(inputClass, "font-medium")}
                                autoFocus
                            />
                        </div>

                        <div>
                            <label htmlFor="milestone-date" className="block text-sm font-medium text-gray-700 mb-1.5">When</label>
                            <input
                                id="milestone-date"
                                type="date"
                                value={date}
                                onChange={e => { setDate(e.target.value); setError(null); }}
                                className={cn(inputClass, "font-medium font-sans")}
                            />
                            {outside && <p className="mt-1.5 text-xs text-amber-600">{outside}</p>}
                        </div>

                        <div>
                            <span className="block text-sm font-medium text-gray-700 mb-1.5">Kind</span>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Kind">
                                {MILESTONE_KINDS.map(k => (
                                    <button
                                        key={k.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={kind === k.id}
                                        onClick={() => setKind(k.id)}
                                        className={cn(
                                            "flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors",
                                            kind === k.id
                                                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                                : "border-gray-200 text-gray-600 hover:bg-gray-50"
                                        )}
                                    >
                                        <k.icon className="w-4 h-4 shrink-0" />
                                        <span className="truncate">{k.label}</span>
                                    </button>
                                ))}
                            </div>
                            <p className="mt-1.5 text-xs text-gray-400">Lets you cut chapters by one kind: moves give your cities, work your jobs.</p>
                        </div>

                        <div>
                            <label htmlFor="milestone-note" className="block text-sm font-medium text-gray-700 mb-1.5">
                                Note <span className="font-normal text-gray-400">(optional)</span>
                            </label>
                            <textarea
                                id="milestone-note"
                                value={note}
                                rows={2}
                                maxLength={280}
                                onChange={e => setNote(e.target.value)}
                                placeholder="New rent, salary in dollars, second child…"
                                className={cn(inputClass, "resize-none")}
                            />
                        </div>

                        {error && <p className="text-sm text-red-600">{error}</p>}
                    </div>

                    <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex justify-between items-center gap-3">
                        {milestone ? (
                            <button
                                type="button"
                                onClick={() => onDelete(milestone)}
                                className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
                            >
                                <Trash2 className="w-4 h-4" /> Delete
                            </button>
                        ) : <span />}
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                            >
                                {milestone ? 'Save' : 'Add milestone'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
