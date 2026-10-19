import { CloudDownload, Loader2 } from 'lucide-react';
import { formatImportTime } from '../lib/importing';
import type { CloudHead } from '../lib/statementCloud';

interface AccountCopyCardProps {
    head: CloudHead;
    error?: string;   // the last try to load it failed
    loading: boolean;
    onLoad: () => void;
}

// On the landing page of a device emptied with "Clear data", or one the account's copy didn't
// reach: the statement the account keeps, to load back here without the file.
export function AccountCopyCard({ head, error, loading, onLoad }: AccountCopyCardProps) {
    return (
        <div className="w-full rounded-2xl border border-emerald-900/5 bg-white shadow-sm px-4 py-3.5 md:px-5 md:py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                    <CloudDownload className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="min-w-0 text-left">
                    <p className="text-sm font-bold text-emerald-950">Your account has a statement</p>
                    <p className="text-xs font-medium text-emerald-800/60 tabular-nums">
                        Imported {formatImportTime(head.importedAt)} · {head.count.toLocaleString('en-US')} rows
                    </p>
                    {error && <p className="text-xs text-amber-700 mt-1 break-words">Couldn't load it: {error}</p>}
                </div>
            </div>
            <button
                type="button"
                onClick={onLoad}
                disabled={loading}
                className="shrink-0 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-md shadow-emerald-600/20 transition-all active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none flex items-center justify-center gap-2 whitespace-nowrap"
            >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Loading…' : error ? 'Try again' : 'Load from account'}
            </button>
        </div>
    );
}
