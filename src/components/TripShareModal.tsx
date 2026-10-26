import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Download, ExternalLink, FileText, Loader2, RefreshCw, Share, X } from 'lucide-react';
import type { Transaction, Trip } from '../types';
import { useHistoricalRates } from '../hooks/useHistoricalRates';
import { useLiveRates } from '../hooks/useLiveRates';
import { formatDayShort } from '../lib/tripFormat';
import {
    DEFAULT_REPORT_PARTS, RUBLES, buildTripReport, currencySign, describeRate, homeCurrency, reportFileName, tripLocalCurrency,
    type ReportCurrency, type ReportParts,
} from '../lib/tripReport';
import { localDayKey, shiftDay } from '../lib/tripUtils';
import { cn } from '../lib/utils';
import { CurrencySelect } from './CurrencySelect';

interface TripShareModalProps {
    trip: Trip;
    trips: Trip[];
    transactions: Transaction[];
    onClose: () => void;
}

// What goes in and in which money, remembered on this device for the next trip shared.
const PARTS_KEY = 'tripReportParts';
const CURRENCY_KEY = 'tripReportCurrency';
const readParts = (): ReportParts => {
    try { return { ...DEFAULT_REPORT_PARTS, ...JSON.parse(localStorage.getItem(PARTS_KEY) ?? '{}') }; } catch { return DEFAULT_REPORT_PARTS; }
};
const readCurrency = () => { try { return localStorage.getItem(CURRENCY_KEY) || 'RUB'; } catch { return 'RUB'; } };
const store = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } };

// A browser that can hand a PDF to other apps (the share sheet on a phone, the Share menu on a Mac).
const canShareFiles = () => {
    try {
        return typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'trip.pdf', { type: 'application/pdf' })] });
    } catch {
        return false;
    }
};

interface MadeFile {
    blob: Blob;
    name: string;
    url: string;
}

interface Made<T> {
    inputs: T; // what the file was made from
    file: MadeFile | null;
    error: string | null;
}

const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/**
 * Makes a PDF of the trip to send someone: its totals, chart, categories and payments, in rubles
 * or in the reader's own money. The file is made again whenever the choices change, so Share
 * hands over what is shown — on a phone the share sheet needs the file ready at the tap.
 */
export function TripShareModal({ trip, trips, transactions, onClose }: TripShareModalProps) {
    const [parts, setPartsState] = useState<ReportParts>(readParts);
    const [code, setCodeState] = useState<string>(readCurrency);
    const [pickingOther, setPickingOther] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [shareError, setShareError] = useState<string | null>(null);
    const shareable = useMemo(canShareFiles, []);

    const setParts = (next: ReportParts) => { setPartsState(next); store(PARTS_KEY, JSON.stringify(next)); };
    const setCode = (next: string) => { setCodeState(next); store(CURRENCY_KEY, next); setPickingOther(false); };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    // What the choices say about this trip: how many payments, whether it has a budget and a home to compare with.
    const overview = useMemo(() => buildTripReport(trip, trips, transactions), [trip, trips, transactions]);

    const choices = useMemo(() => {
        const list = ['RUB', tripLocalCurrency(trip, transactions), homeCurrency(transactions), 'USD', 'EUR'];
        return [...new Set([...list, code].filter((c): c is string => !!c))];
    }, [trip, transactions, code]);

    // One rate for the whole report: the trip's last day, or yesterday's for a trip not over yet
    // (today's isn't published until the day ends). Today's live rate stands in when that day is missing.
    const rateDay = useMemo(() => {
        const yesterday = shiftDay(localDayKey(), -1);
        return trip.endDate < yesterday ? trip.endDate : yesterday;
    }, [trip.endDate]);
    const foreign = code !== 'RUB';
    const historical = useHistoricalRates(foreign ? [rateDay] : [], foreign ? [code] : []);
    const live = useLiveRates();
    let rubPerUnit: number | null = foreign ? null : 1;
    let rateFrom: string | null = null;
    if (foreign) {
        const onDay = historical.snapshots[rateDay]?.[code];
        if (typeof onDay === 'number' && onDay > 0) [rubPerUnit, rateFrom] = [onDay, rateDay];
        else if (!historical.isLoading && live.rates[code] > 0) [rubPerUnit, rateFrom] = [live.rates[code], live.date ?? localDayKey()];
    }
    const rateLoading = foreign && rubPerUnit === null && (historical.isLoading || live.isLoading);
    const currency = useMemo<ReportCurrency | null>(
        () => (rubPerUnit === null ? null : foreign ? { code, rubPerUnit, rateDay: rateFrom } : RUBLES),
        [foreign, code, rubPerUnit, rateFrom]
    );

    // The file is made from these; a result for other inputs is out of date.
    const inputs = useMemo(() => ({ trip, trips, transactions, currency, parts, attempt }), [trip, trips, transactions, currency, parts, attempt]);
    const [made, setMade] = useState<Made<typeof inputs> | null>(null);
    useEffect(() => {
        if (!inputs.currency) return;
        const reportCurrency = inputs.currency;
        let cancelled = false;
        // A moment's wait: ticking several boxes in a row makes the file once.
        const timer = window.setTimeout(async () => {
            try {
                const { renderTripReportPdf } = await import('../lib/tripReportPdf');
                const report = buildTripReport(inputs.trip, inputs.trips, inputs.transactions, reportCurrency);
                const blob = await renderTripReportPdf(report, inputs.parts);
                if (!cancelled) setMade({ inputs, file: { blob, name: reportFileName(report), url: URL.createObjectURL(blob) }, error: null });
            } catch (e) {
                if (!cancelled) setMade({ inputs, file: null, error: e instanceof Error ? e.message : String(e) });
            }
        }, 350);
        return () => { cancelled = true; window.clearTimeout(timer); };
    }, [inputs]);
    // A file's address lives until the next file replaces it, or the window closes.
    useEffect(() => () => { if (made?.file) URL.revokeObjectURL(made.file.url); }, [made]);

    const current = made?.inputs === inputs ? made : null;
    const making = !!currency && !current;
    const file = current?.file ?? null;
    const error = current?.error ?? null;
    const ready = !!file;

    const share = async () => {
        if (!file) return;
        setShareError(null);
        try {
            await navigator.share({ files: [new File([file.blob], file.name, { type: 'application/pdf' })], title: file.name.replace(/\.pdf$/, '') });
        } catch (e) {
            // Closing the share sheet without picking anything isn't a failure.
            if (!(e instanceof DOMException && e.name === 'AbortError')) setShareError(`Couldn't share: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const download = () => {
        if (!file) return;
        const link = document.createElement('a');
        link.href = file.url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    const toggles: { key: keyof ReportParts; label: string; note?: string; shown: boolean }[] = [
        { key: 'budget', label: 'Budget', note: 'what was planned and how it went', shown: !!overview.budget },
        { key: 'chart', label: 'Day-by-day chart', shown: true },
        { key: 'categories', label: 'Where the money went', note: 'spending by category', shown: true },
        { key: 'biggest', label: 'Biggest spends', shown: true },
        { key: 'home', label: 'Everyday spending vs. home', note: 'it tells how much you spend at home', shown: !!overview.comparison },
        {
            key: 'payments',
            label: 'Every payment, day by day',
            note: `${overview.paymentCount} payment${overview.paymentCount === 1 ? '' : 's'}, with their notes`,
            shown: overview.paymentCount > 0,
        },
    ];

    let rateLine: React.ReactNode;
    if (rateLoading) rateLine = <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Getting the rate…</span>;
    else if (currency === null) rateLine = <span className="text-red-600">Couldn't get the rate of {code}. Check the connection, or choose another currency.</span>;
    else if (currency.rateDay) rateLine = `${describeRate(currency)} on ${formatDayShort(currency.rateDay)} ${currency.rateDay.slice(0, 4)} · payments made in ${code} stay as paid`;
    else rateLine = 'As the app counts: payments in other money at the rubles they cost';

    return createPortal(
        <div className="fixed inset-0 z-[100] overflow-y-auto">
            <div className="min-h-full flex items-end sm:items-center justify-center sm:p-4">
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="trip-share-title"
                    className="relative z-10 bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-gray-100 animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
                >
                    <div className="flex items-start gap-3 p-5 sm:p-6 pb-0 sm:pb-0">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 id="trip-share-title" className="text-lg font-bold text-gray-900 leading-snug">Share a PDF of “{trip.name.trim()}”</h3>
                            <p className="text-sm text-gray-500">The trip's numbers on a few pages, to send to anyone.</p>
                        </div>
                        <button onClick={onClose} className="p-1.5 -mr-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" aria-label="Close">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-5 sm:p-6 space-y-5">
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Currency</div>
                            <div className="flex flex-wrap gap-1.5">
                                {choices.map(c => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => setCode(c)}
                                        aria-pressed={code === c}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                                            code === c ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                                        )}
                                    >
                                        <span className="text-gray-400 tabular-nums">{currencySign(c)}</span>{c}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setPickingOther(v => !v)}
                                    aria-expanded={pickingOther}
                                    className={cn("px-2.5 py-1.5 rounded-lg border text-sm font-medium transition-colors", pickingOther ? "bg-gray-100 border-gray-300 text-gray-800" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50")}
                                >
                                    Other…
                                </button>
                            </div>
                            {pickingOther && <div className="mt-2"><CurrencySelect value={code} onChange={setCode} /></div>}
                            <p className="text-xs text-gray-500 mt-2 leading-snug">{rateLine}</p>
                        </div>

                        <div>
                            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">What goes in</div>
                            <p className="text-xs text-gray-400 mb-2">The totals are always there: what the trip cost, booked ahead and on the trip.</p>
                            <div className="divide-y divide-gray-100 border-y border-gray-100">
                                {toggles.filter(t => t.shown).map(t => (
                                    <button
                                        key={t.key}
                                        type="button"
                                        role="checkbox"
                                        aria-checked={parts[t.key]}
                                        onClick={() => setParts({ ...parts, [t.key]: !parts[t.key] })}
                                        className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-gray-50/70 transition-colors"
                                    >
                                        <span className={cn("w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors", parts[t.key] ? "border-emerald-500 bg-emerald-500" : "border-gray-300 bg-white")}>
                                            {parts[t.key] && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-sm font-medium text-gray-900">{t.label}</span>
                                            {t.note && <span className="block text-xs text-gray-500">{t.note}</span>}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="px-5 sm:px-6 py-4 border-t border-gray-100 bg-gray-50/60 rounded-b-none sm:rounded-b-3xl space-y-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                        <div className="text-xs min-h-[1rem]" aria-live="polite">
                            {error ? (
                                <span className="flex items-start gap-1.5 text-red-600">
                                    <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" />
                                    <span>Couldn't make the PDF: {error}</span>
                                </span>
                            ) : making || rateLoading ? (
                                <span className="inline-flex items-center gap-1.5 text-gray-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Making the PDF…</span>
                            ) : file ? (
                                <span className="text-gray-500"><span className="font-medium text-gray-700">{file.name}</span> · {formatSize(file.blob.size)}</span>
                            ) : null}
                            {shareError && <span className="block text-red-600 mt-1">{shareError}</span>}
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            {error ? (
                                <button onClick={() => setAttempt(n => n + 1)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50">
                                    <RefreshCw className="w-4 h-4" /> Try again
                                </button>
                            ) : (
                                <>
                                    <a
                                        href={ready ? file!.url : undefined}
                                        target="_blank"
                                        rel="noopener"
                                        aria-disabled={!ready}
                                        className={cn("hidden sm:inline-flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors", !ready && "opacity-40 pointer-events-none")}
                                    >
                                        <ExternalLink className="w-4 h-4" /> Open
                                    </a>
                                    <button
                                        onClick={download}
                                        disabled={!ready}
                                        className={cn(
                                            "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-40",
                                            shareable ? "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50" : "flex-1 sm:flex-none bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                                        )}
                                    >
                                        <Download className="w-4 h-4" /> Download
                                    </button>
                                    {shareable && (
                                        <button
                                            onClick={share}
                                            disabled={!ready}
                                            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-colors disabled:opacity-40"
                                        >
                                            <Share className="w-4 h-4" /> Share…
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
