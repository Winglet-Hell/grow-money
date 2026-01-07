import React, { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, ArrowUp } from 'lucide-react';
import { cn } from '../lib/utils';
import { parseFile } from '../lib/parser';
import type { Transaction } from '../types';

interface FileUploaderProps {
    onDataLoaded: (data: Transaction[]) => void;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onDataLoaded }) => {
    const [isDragOver, setIsDragOver] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

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
        e.preventDefault();
        setIsDragOver(false);

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            processFile(files[0]);
        }
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            processFile(e.target.files[0]);
        }
    }

    return (
        <div className="w-full max-w-2xl mx-auto mt-6 md:mt-12 relative group z-20 perspective-1000">
            {/* 1. Deep Atmospheric Glow (Behind) */}
            <div className={cn(
                "absolute -inset-1 rounded-[3rem] bg-gradient-to-r from-emerald-400/20 to-cyan-400/20 blur-xl transition-all duration-700 opacity-60 group-hover:opacity-100",
                isDragOver && "opacity-100 blur-2xl scale-105 from-emerald-400/40 to-cyan-400/40"
            )} />

            {/* 2. Main Crystal Panel */}
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                    "relative rounded-[2.5rem] p-10 md:p-16 text-center transition-all duration-500 cursor-pointer flex flex-col items-center justify-center gap-8 overflow-hidden min-h-[500px]",
                    // Glass Base
                    "backdrop-blur-md bg-white/20",
                    // Borders & Depth
                    "border border-white/60 shadow-xl",
                    // Inner Highlight (Top) & Shadow (Bottom) for Thickness
                    "shadow-[inset_0_1px_1px_rgba(255,255,255,0.6),_inset_0_-1px_1px_rgba(0,0,0,0.05),_0_10px_40px_-10px_rgba(0,0,0,0.1)]",
                    isDragOver
                        ? "bg-white/30 border-emerald-300 scale-[1.01] shadow-[0_20px_50px_-12px_rgba(16,185,129,0.3)]"
                        : "hover:bg-white/25 hover:border-white/80 hover:scale-[1.005]",
                    loading && "opacity-50 pointer-events-none"
                )}
            >
                {/* 3. Shine / Reflection Layer */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-transparent to-transparent opacity-60 pointer-events-none" />
                <div className="absolute -inset-full bg-gradient-to-tr from-transparent via-white/10 to-transparent rotate-12 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

                <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    id="file-upload"
                    onChange={handleInputChange}
                />
                <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-10 w-full relative z-10">

                    {/* 4. Central Icon "Jewel" */}
                    <div className="relative group/icon">
                        {/* Pulse Ring */}
                        <div className={cn(
                            "absolute inset-0 bg-emerald-400 rounded-full blur-xl opacity-0 transition-all duration-500",
                            isDragOver ? "opacity-40 scale-150 animate-pulse" : "group-hover/icon:opacity-20"
                        )} />

                        <div className={cn(
                            "relative w-24 h-24 rounded-[1.5rem] bg-gradient-to-br from-white/80 to-white/40 border border-white shadow-lg backdrop-blur-xl flex items-center justify-center transition-all duration-500",
                            "shadow-[inset_0_2px_4px_rgba(255,255,255,1),_0_8px_20px_-4px_rgba(16,185,129,0.2)]",
                            isDragOver ? "scale-110 rotate-3 border-emerald-200" : "group-hover/icon:-translate-y-1"
                        )}>
                            <Upload className={cn(
                                "w-10 h-10 text-emerald-500/80 transition-all duration-300",
                                isDragOver ? "text-emerald-600 scale-110" : "group-hover/icon:text-emerald-500"
                            )} />
                        </div>

                        {/* Floating 'Upload' text below icon on hover */}
                        <div className={cn(
                            "absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-bold text-emerald-600 uppercase tracking-widest opacity-0 transform translate-y-2 transition-all duration-300",
                            (isDragOver || "group-hover:opacity-100 group-hover:translate-y-0")
                        )}>
                            Click or Drag
                        </div>
                    </div>

                    <div className="space-y-4 max-w-md md:max-w-full px-4">
                        <h3 className={cn(
                            "text-3xl font-bold tracking-tight text-emerald-950/90 transition-colors drop-shadow-sm",
                            isDragOver && "text-emerald-800"
                        )}>
                            Drop Statement Here
                        </h3>
                        <p className="text-emerald-900/50 text-lg font-medium leading-relaxed">
                            Drag & drop your Excel file to unlock <span className="text-emerald-600/80 font-semibold">instant</span> analytics.
                        </p>
                    </div>

                    {/* 5. Supported Formats Pills */}
                    <div className="flex items-center justify-center gap-3">
                        {['XLSX', 'CSV'].map((ext) => (
                            <span key={ext} className="flex items-center gap-1.5 bg-white/40 border border-white/60 px-4 py-2 rounded-xl text-xs text-emerald-800/70 font-bold uppercase tracking-widest backdrop-blur-md shadow-sm transition-transform hover:scale-105 hover:bg-white/60">
                                <FileSpreadsheet className="w-3.5 h-3.5" /> {ext}
                            </span>
                        ))}
                    </div>
                </label>
            </div>

            {error && (
                <div className="mt-8 p-4 rounded-2xl bg-red-50/90 border border-red-100 text-red-600 text-sm animate-in fade-in slide-in-from-top-4 flex items-center justify-center font-bold shadow-lg backdrop-blur-md">
                    {error}
                </div>
            )}
        </div>
    );
};
