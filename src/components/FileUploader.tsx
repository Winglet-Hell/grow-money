import React, { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, Database, Lock } from 'lucide-react';
import { cn } from '../lib/utils';
import { parseFile } from '../lib/parser';
import { generateTestData } from '../lib/testData';
import type { Transaction } from '../types';

interface FileUploaderProps {
    onDataLoaded: (data: Transaction[]) => void;
    isAuthenticated?: boolean;
    onSignIn?: () => void;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onDataLoaded, isAuthenticated = false, onSignIn }) => {
    const [isDragOver, setIsDragOver] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        if (!isAuthenticated) return;
        e.preventDefault();
        setIsDragOver(true);
    }, [isAuthenticated]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    }, []);

    const processFile = async (file: File) => {
        setLoading(true);
        setError(null);
        try {
            const data = await parseFile(file);
            onDataLoaded(data);
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Failed to parse file');
        } finally {
            setLoading(false);
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        if (!isAuthenticated) return;
        e.preventDefault();
        setIsDragOver(false);

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            processFile(files[0]);
        }
    }, [isAuthenticated]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            processFile(e.target.files[0]);
        }
    }

    const handleLoadTestData = async (e?: React.MouseEvent) => {
        e?.preventDefault();
        e?.stopPropagation();
        setLoading(true);

        try {
            console.log("Generating local test data...");
            const transactionData = generateTestData();
            onDataLoaded(transactionData);
        } catch (err) {
            console.error("Error loading test data:", err);
            onDataLoaded(generateTestData());
        } finally {
            setTimeout(() => {
                setLoading(false);
            }, 500);
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto mt-2 md:mt-4 relative group z-20 perspective-1000">
            {/* 1. Deep Atmospheric Glow (Behind) - Hidden on mobile to save performance */}
            <div className={cn(
                "absolute -inset-1 rounded-[3rem] bg-gradient-to-r from-emerald-400/20 to-cyan-400/20 blur-xl transition-all duration-700 opacity-60 group-hover:opacity-100 hidden md:block",
                isDragOver && "opacity-100 blur-2xl scale-105 from-emerald-400/40 to-cyan-400/40"
            )} />

            {/* 2. Main Crystal Panel */}
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                    "relative transition-all duration-500 flex flex-col items-center justify-center gap-6 md:gap-8 overflow-hidden",
                    // Mobile: Minimalist, Desktop: Glass Panel
                    "md:rounded-[2.5rem] md:p-16 md:backdrop-blur-md md:bg-white/20 md:border md:border-white/60 md:shadow-xl md:min-h-[500px]",
                    "bg-transparent p-4",
                    // Desktop Inner Highlight
                    "md:shadow-[inset_0_1px_1px_rgba(255,255,255,0.6),_inset_0_-1px_1px_rgba(0,0,0,0.05),_0_10px_40px_-10px_rgba(0,0,0,0.1)]",
                    isDragOver
                        ? "md:bg-white/30 md:border-emerald-300 md:scale-[1.01] md:shadow-[0_20px_50px_-12px_rgba(16,185,129,0.3)]"
                        : "md:hover:bg-white/25 md:hover:border-white/80 md:hover:scale-[1.005]",
                    loading && "opacity-50 pointer-events-none"
                )}
            >
                {/* 3. Guest Opaque Overlay */}
                {!isAuthenticated && (
                    <div className="md:absolute md:inset-0 z-[60] flex flex-col items-center justify-center p-0 md:p-6 bg-transparent md:bg-white/95 md:backdrop-blur-md overflow-hidden rounded-[2.5rem] md:rounded-[2.5rem] relative w-full">
                        <div className="flex flex-col items-center gap-6 md:gap-6 max-w-sm text-center animate-in zoom-in-95 duration-500 py-4 w-full px-4">
                            <div className="w-16 h-16 md:w-16 md:h-16 rounded-[1.5rem] bg-emerald-50 border border-emerald-100 flex items-center justify-center shadow-sm md:shadow-inner mb-2 md:mb-0">
                                <Lock className="w-8 h-8 md:w-8 md:h-8 text-emerald-600" />
                            </div>

                            <div className="space-y-1 md:space-y-2">
                                <h3 className="text-2xl md:text-2xl font-bold text-emerald-950 tracking-tight">Secure Your Data</h3>
                                <p className="text-emerald-800/80 text-base md:text-base font-medium leading-relaxed px-2">
                                    <span className="md:hidden">Sign in to start</span>
                                    <span className="hidden md:inline">Sign in to securely upload and analyze your financial statements.</span>
                                </p>
                            </div>

                            <div className="flex flex-col gap-4 w-full pt-4 md:pt-2">
                                <button
                                    onClick={onSignIn}
                                    className="w-full py-5 md:py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-lg md:text-base font-bold rounded-2xl md:rounded-2xl shadow-xl shadow-emerald-600/30 md:shadow-lg md:shadow-emerald-600/20 transition-all active:scale-[0.98] whitespace-nowrap tracking-wide"
                                >
                                    Sign In to Upload
                                </button>
                                <button
                                    onClick={() => handleLoadTestData()}
                                    className="w-full py-5 md:py-3.5 bg-white border-2 border-emerald-100 text-emerald-700 md:text-emerald-600 text-lg md:text-base font-bold rounded-2xl md:rounded-2xl hover:bg-emerald-50 transition-all flex items-center justify-center gap-2 active:scale-[0.98] whitespace-nowrap shadow-lg md:shadow-none"
                                >
                                    <Database className="w-5 h-5 md:w-4 md:h-4 opacity-75" />
                                    Try Test Data
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 4. Shine / Reflection Layer - Desktop Only */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-transparent to-transparent opacity-60 pointer-events-none hidden md:block" />
                <div className="absolute -inset-full bg-gradient-to-tr from-transparent via-white/10 to-transparent rotate-12 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none hidden md:block" />

                <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    id="file-upload"
                    onChange={handleInputChange}
                />

                <div className={cn("flex flex-col items-center gap-6 md:gap-10 w-full relative z-10", !isAuthenticated && "hidden md:flex")}>
                    <div className="relative w-full">
                        <label
                            htmlFor={isAuthenticated ? "file-upload" : undefined}
                            className={cn(
                                "flex flex-col items-center gap-6 md:gap-10 w-full transition-all duration-500",
                                isAuthenticated ? "cursor-pointer" : "opacity-40 grayscale-[0.5] pointer-events-none"
                            )}
                        >
                            {/* 5. Central Icon "Jewel" */}
                            <div className="relative group/icon">
                                {/* Pulse Ring */}
                                <div className={cn(
                                    "absolute inset-0 bg-emerald-400 rounded-full blur-xl opacity-0 transition-all duration-500",
                                    isDragOver ? "opacity-40 scale-150 animate-pulse" : "group-hover/icon:opacity-20"
                                )} />

                                <div className={cn(
                                    "relative w-16 h-16 md:w-24 md:h-24 rounded-2xl md:rounded-[1.5rem] bg-gradient-to-br from-white/80 to-white/40 border border-white shadow-lg md:backdrop-blur-xl flex items-center justify-center transition-all duration-500",
                                    "shadow-[inset_0_2px_4px_rgba(255,255,255,1),_0_8px_20px_-4px_rgba(16,185,129,0.2)]",
                                    isDragOver ? "scale-110 rotate-3 border-emerald-200" : "md:group-hover/icon:-translate-y-1"
                                )}>
                                    <Upload className={cn(
                                        "w-8 h-8 md:w-10 md:h-10 text-emerald-500/80 transition-all duration-300",
                                        isDragOver ? "text-emerald-600 scale-110" : "group-hover/icon:text-emerald-500"
                                    )} />
                                </div>

                                {/* Floating 'Upload' text below icon on hover - Desktop Only */}
                                <div className={cn(
                                    "absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-bold text-emerald-600 uppercase tracking-widest opacity-0 transform translate-y-2 transition-all duration-300 hidden md:block",
                                    (isDragOver || "group-hover:opacity-100 group-hover:translate-y-0")
                                )}>
                                    Click or Drag
                                </div>
                            </div>

                            <div className="space-y-2 md:space-y-4 max-w-md md:max-w-full px-4 text-center">
                                <h3 className={cn(
                                    "text-2xl md:text-3xl font-bold tracking-tight text-emerald-950/90 transition-colors drop-shadow-sm",
                                    isDragOver && "text-emerald-800"
                                )}>
                                    {isDragOver ? "Drop Now" : "Upload Statement"}
                                </h3>
                                <p className="text-emerald-900/50 text-base md:text-lg font-medium leading-relaxed">
                                    <span className="md:hidden">Excel / CSV formats</span>
                                    <span className="hidden md:inline">Drag & drop Excel file to unlock <span className="text-emerald-600/80 font-semibold">instant</span> analytics.</span>
                                </p>
                            </div>
                        </label>
                    </div>

                    {/* 6. Actions Row: Supported Formats - Hidden on mobile */}
                    <div className="hidden md:flex items-center justify-center gap-3 mt-0 md:mt-2 w-full max-w-md">
                        {['XLSX', 'CSV'].map((ext) => (
                            <span key={ext} className="flex items-center gap-1.5 bg-white/40 border border-white/60 px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-[10px] md:text-xs text-emerald-800/70 font-bold uppercase tracking-widest backdrop-blur-md shadow-sm pointer-events-none select-none">
                                <FileSpreadsheet className="w-3 md:w-3.5 h-3 md:h-3.5" /> {ext}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {error && (
                <div className="mt-4 md:mt-8 p-4 rounded-2xl bg-red-50/90 border border-red-100 text-red-600 text-xs md:text-sm animate-in fade-in slide-in-from-top-4 flex items-center justify-center font-bold shadow-lg backdrop-blur-md italic">
                    {error}
                </div>
            )}
        </div>
    );
};
