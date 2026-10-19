import React, { useState, type ReactNode } from 'react';
import { Bot, Database, DatabaseBackup, FileSpreadsheet, Heart, LayoutDashboard, LineChart, Lock, Map as MapIcon, PieChart, Repeat, Upload, Wallet, type LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { generateTestData } from '../lib/testData';
import type { Transaction } from '../types';

// What the pages do, for visitors. Keep each line true to the page it names.
const FEATURES = [
    { icon: LayoutDashboard, title: 'Dashboard', text: 'The month at a glance: what came in, what went out, and how it compares.' },
    { icon: PieChart, title: 'Expenses and income', text: 'Every category broken down, with monthly spending limits.' },
    { icon: LineChart, title: 'Trends and milestones', text: 'Years of history, compared by the chapters of your life.' },
    { icon: MapIcon, title: 'Trips', text: 'What each trip cost in total and per day, shared payments split out.' },
    { icon: Wallet, title: 'Wallets and net worth', text: 'Every currency in one net worth, and how it moved over time.' },
    { icon: Heart, title: 'Goals', text: 'When each goal is reached at the pace you save.' },
    { icon: Repeat, title: 'Recurring', text: 'Subscriptions and regular bills, found in your operations.' },
    { icon: Bot, title: 'Ask Claude or ChatGPT', text: 'Connect an AI app to ask about your money. Read-only, with your consent.' },
];

interface LandingProps {
    isAuthenticated: boolean;
    onSignIn: () => void;
    onTestData: (data: Transaction[]) => void; // "Try with test data": shown, never stored
    onFile: (file: File) => void;              // a file dropped on the import screen
    onChooseFile: () => void;                  // opens the shared file picker
    accountCopy?: ReactNode;                   // "Your account has a statement", when it has one
}

// The page with nothing imported: a visitor sees what Grow Money is, a signed-in account with no
// statement on this device sees where to bring one in.
export function Landing({ isAuthenticated, onSignIn, onTestData, onFile, onChooseFile, accountCopy }: LandingProps) {
    return isAuthenticated
        ? <ImportScreen onFile={onFile} onChooseFile={onChooseFile} accountCopy={accountCopy} />
        : <GuestLanding onSignIn={onSignIn} onTestData={onTestData} />;
}

function GuestLanding({ onSignIn, onTestData }: Pick<LandingProps, 'onSignIn' | 'onTestData'>) {
    return (
        <div className="enter-cascade">
            <section className="min-h-[calc(100svh-12rem)] md:min-h-0 flex flex-col justify-center text-center max-w-4xl mx-auto pt-6 md:pt-16">
                <h1 className="text-[2.5rem] md:text-5xl lg:text-[3.5rem] font-bold tracking-tight leading-[1.05] text-emerald-950">
                    See where your money goes,{' '}
                    <br className="hidden md:block" />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500">and where it grows.</span>
                </h1>
                <p className="mt-5 md:mt-6 max-w-xl mx-auto text-base md:text-lg leading-relaxed text-emerald-900/60">
                    Grow Money turns your expense app&apos;s backup into one clear picture: spending, income, trips, goals and net worth.
                </p>
                <div className="mt-8 md:mt-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
                    <button
                        type="button"
                        onClick={onSignIn}
                        className="h-12 px-7 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.99]"
                    >
                        Sign in
                    </button>
                    <button
                        type="button"
                        onClick={() => onTestData(generateTestData())}
                        className="h-12 px-7 rounded-xl bg-white border border-emerald-900/10 text-emerald-900 font-semibold hover:bg-emerald-50 transition-colors flex items-center justify-center gap-2"
                    >
                        <Database className="w-4 h-4 text-emerald-600" />
                        Try with test data
                    </button>
                </div>
                <p className="mt-5 text-sm text-emerald-900/45">
                    <Lock className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />
                    Statements are read on your device and never uploaded.
                </p>
            </section>

            {/* Hidden on phones, as the old grid was: the hero and its buttons are the whole page there. */}
            <section className="hidden md:block mt-24 lg:mt-28">
                <h2 className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700/50 mb-8">What you get</h2>
                <ul className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {FEATURES.map(({ icon: Icon, title, text }) => (
                        <li key={title} className="rounded-2xl bg-white border border-emerald-900/5 shadow-sm p-5 space-y-3">
                            <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                <Icon className="w-5 h-5" />
                            </span>
                            <span className="block space-y-1">
                                <span className="block font-semibold text-emerald-950">{title}</span>
                                <span className="block text-sm leading-relaxed text-emerald-900/60">{text}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            </section>

            <p className="mt-16 md:mt-20 text-center text-xs font-medium uppercase tracking-widest text-emerald-900/35">© 2026 Grow Money</p>
        </div>
    );
}

function ImportScreen({ onFile, onChooseFile, accountCopy }: Pick<LandingProps, 'onFile' | 'onChooseFile' | 'accountCopy'>) {
    const [isDragOver, setIsDragOver] = useState(false);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
    };

    return (
        <div className="enter-cascade max-w-2xl mx-auto pt-4 md:pt-12">
            <div className="text-center">
                <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-emerald-950">Import your statement</h1>
                <p className="mt-3 md:mt-4 text-base md:text-lg text-emerald-900/60">
                    Add the file from your expense app, and every page fills in from it.
                </p>
            </div>

            {accountCopy && <div className="mt-8">{accountCopy}</div>}

            <button
                type="button"
                onClick={onChooseFile}
                onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                // Moving over the icon or the text inside leaves the zone too; only leaving it for good counts.
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragOver(false); }}
                onDrop={handleDrop}
                className={cn(
                    'group mt-8 w-full rounded-3xl border-2 border-dashed px-6 py-10 md:py-14 flex flex-col items-center text-center gap-5 transition-colors',
                    isDragOver ? 'border-emerald-500 bg-emerald-50' : 'border-emerald-900/15 bg-white/60 hover:border-emerald-400 hover:bg-white',
                )}
            >
                <span className={cn(
                    'w-14 h-14 rounded-2xl flex items-center justify-center transition-colors',
                    isDragOver ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-600',
                )}>
                    <Upload className="w-6 h-6" />
                </span>
                {/* Phones can't drag a file in: the button alone says it there. */}
                <span className="hidden md:block space-y-1">
                    <span className="block text-lg font-semibold text-emerald-950">{isDragOver ? 'Drop to import' : 'Drop the file here'}</span>
                    <span className="block text-sm text-emerald-900/50">or pick it on this computer</span>
                </span>
                <span className="h-11 px-5 rounded-xl bg-emerald-600 group-hover:bg-emerald-700 text-white text-sm font-semibold shadow-md shadow-emerald-600/20 flex items-center transition-colors">
                    Choose file
                </span>
            </button>

            <div className="mt-4 grid sm:grid-cols-2 gap-3">
                <FormatCard icon={DatabaseBackup} title="Backup" ext=".mmbackup" best>
                    Operations, wallet balances with their history, and category looks.
                </FormatCard>
                <FormatCard icon={FileSpreadsheet} title="Excel export" ext=".xlsx · .csv">
                    Operations only. New wallets start at a zero balance.
                </FormatCard>
            </div>

            <p className="mt-8 max-w-lg mx-auto text-sm text-center text-emerald-900/50">
                <Lock className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />
                The file is read on this device and never uploaded. The operations are saved to your account for your other devices.
            </p>
        </div>
    );
}

function FormatCard({ icon: Icon, title, ext, best, children }: { icon: LucideIcon; title: string; ext: string; best?: boolean; children: ReactNode }) {
    return (
        <div className="rounded-2xl bg-white border border-emerald-900/5 shadow-sm p-4 flex items-start gap-3 text-left">
            <span className="shrink-0 w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Icon className="w-[18px] h-[18px]" />
            </span>
            <div className="min-w-0 space-y-0.5">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-emerald-950">{title}</span>
                    <span className="text-xs font-medium text-emerald-900/40">{ext}</span>
                    {best && <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[11px] font-semibold">Best</span>}
                </p>
                <p className="text-sm leading-relaxed text-emerald-900/60">{children}</p>
            </div>
        </div>
    );
}
