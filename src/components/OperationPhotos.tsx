import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Loader2, Paperclip, X } from 'lucide-react';
import { loadPhoto } from '../lib/photos';
import { cn } from '../lib/utils';

// The photos attached to an operation in the expense app (lib/photos): a paperclip next to it, and
// the pictures full screen once it's clicked. Nothing is fetched before that.

/** A paperclip for an operation's photos; nothing when it has none. `title` names the operation. */
export function PhotoButton({ photos, title, className }: { photos?: string[]; title: string; className?: string }) {
    const [open, setOpen] = useState(false);
    const names = [...new Set(photos ?? [])];
    if (names.length === 0) return null;
    const label = names.length === 1 ? 'Photo from the app' : `${names.length} photos from the app`;
    return (
        <>
            <button
                type="button"
                // Rows that react to a click or a key themselves (a trip's checkboxes, a sale to edit) don't see these.
                onClick={e => { e.stopPropagation(); setOpen(true); }}
                onKeyDown={e => e.stopPropagation()}
                className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-md p-1 -my-1 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40", className)}
                title={label}
                aria-label={`${label}: ${title}`}
            >
                <Paperclip className="w-3.5 h-3.5" />
                {names.length > 1 && <span className="text-[10px] font-semibold tabular-nums">{names.length}</span>}
            </button>
            {open && <PhotoViewer names={names} title={title} onClose={() => setOpen(false)} />}
        </>
    );
}

function PhotoViewer({ names, title, onClose }: { names: string[]; title: string; onClose: () => void }) {
    const [index, setIndex] = useState(0);
    const [shown, setShown] = useState<{ name: string; url?: string; error?: string } | null>(null);
    const swipeFrom = useRef<{ x: number; y: number } | null>(null);
    const name = names[Math.min(index, names.length - 1)];
    const next = names.length > 1 ? names[(index + 1) % names.length] : null;
    const step = (by: number) => setIndex(i => (i + by + names.length) % names.length);

    // The next photo comes down while this one is looked at, so going on doesn't wait.
    useEffect(() => {
        if (next) loadPhoto(next).catch(() => undefined);
    }, [next]);

    useEffect(() => {
        let url: string | undefined;
        let live = true;
        loadPhoto(name).then(
            blob => {
                if (!live) return;
                url = URL.createObjectURL(blob);
                setShown({ name, url });
            },
            (err: unknown) => { if (live) setShown({ name, error: err instanceof Error ? err.message : String(err) }); },
        );
        return () => {
            live = false;
            if (url) URL.revokeObjectURL(url);
        };
    }, [name]);

    // Escape closes only the photo: it is caught before a dialog underneath (an operation list)
    // hears it on the document. The arrows go through several photos.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowLeft' && names.length > 1) step(-1);
            else if (e.key === 'ArrowRight' && names.length > 1) step(1);
            else return;
            e.stopPropagation();
            e.preventDefault();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    });

    // The page under it stays put, and a dialog under it keeps its own lock once this closes.
    useEffect(() => {
        const before = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = before; };
    }, []);

    const current = shown?.name === name ? shown : null;
    const arrow = "absolute top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors";

    return createPortal(
        // Clicks and keys stop here: in React they would travel on to the row the paperclip is in.
        <div
            className="fixed inset-0 z-[120] flex flex-col animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            aria-label={`Photos: ${title}`}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
        >
            <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />

            <div className="relative flex items-center gap-3 px-4 sm:px-6 py-3 text-white">
                <p className="min-w-0 flex-1 truncate text-sm font-medium" title={title}>{title}</p>
                {names.length > 1 && <span className="shrink-0 text-xs tabular-nums text-white/60">{index + 1} of {names.length}</span>}
                <button
                    type="button"
                    onClick={onClose}
                    autoFocus
                    aria-label="Close"
                    className="shrink-0 p-2 -mr-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div
                className="relative flex-1 min-h-0 flex items-center justify-center px-4 pb-6 sm:px-16"
                onClick={onClose}
                // On a phone a sideways swipe goes through the photos; a second finger (zooming) doesn't.
                onTouchStart={e => {
                    const t = e.touches[0];
                    swipeFrom.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
                }}
                onTouchEnd={e => {
                    const from = swipeFrom.current;
                    swipeFrom.current = null;
                    const t = e.changedTouches[0];
                    if (!from || names.length < 2) return;
                    const dx = t.clientX - from.x;
                    if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(t.clientY - from.y)) step(dx < 0 ? 1 : -1);
                }}
            >
                {current?.url ? (
                    <img
                        src={current.url}
                        alt={names.length > 1 ? `Photo ${index + 1} of ${names.length}: ${title}` : `Photo: ${title}`}
                        onClick={e => e.stopPropagation()}
                        className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
                    />
                ) : current?.error ? (
                    <p onClick={e => e.stopPropagation()} className="max-w-sm rounded-xl bg-white px-5 py-4 text-sm text-gray-600 shadow-xl">{current.error}</p>
                ) : (
                    <Loader2 className="w-8 h-8 text-white/70 animate-spin" aria-label="Loading the photo" />
                )}
                {names.length > 1 && (
                    <>
                        <button type="button" onClick={e => { e.stopPropagation(); step(-1); }} aria-label="Previous photo" className={cn(arrow, "left-2 sm:left-4")}>
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button type="button" onClick={e => { e.stopPropagation(); step(1); }} aria-label="Next photo" className={cn(arrow, "right-2 sm:right-4")}>
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </>
                )}
            </div>
        </div>,
        document.body
    );
}
