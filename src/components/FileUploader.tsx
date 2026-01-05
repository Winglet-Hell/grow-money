import React, { useCallback, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
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
        <div className="w-full max-w-xl mx-auto mt-10">
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                    "border-2 border-dashed rounded-xl p-10 text-center transition-all duration-200 cursor-pointer flex flex-col items-center justify-center gap-4",
                    isDragOver
                        ? "border-emerald-500 bg-emerald-50/50 scale-[1.02]"
                        : "border-gray-200 hover:border-emerald-400 hover:bg-gray-50",
                    loading && "opacity-50 pointer-events-none"
                )}
            >
                <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    id="file-upload"
                    onChange={handleInputChange}
                />
                <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-4 w-full">
                    <div className={cn(
                        "p-4 rounded-full bg-emerald-100 text-emerald-600 mb-2 transition-transform duration-300",
                        isDragOver && "scale-110"
                    )}>
                        <FileSpreadsheet className="w-8 h-8" />
                    </div>

                    <div className="space-y-1">
                        <h3 className="text-xl font-semibold text-gray-900">
                            Drop your bank statement here
                        </h3>
                        <p className="text-sm text-gray-500">
                            Supports Excel (.xlsx) and CSV files
                        </p>
                    </div>
                </label>
            </div>

            {error && (
                <div className="mt-4 p-4 rounded-xl bg-red-50 text-red-600 text-sm animate-in fade-in slide-in-from-top-2">
                    {error}
                </div>
            )}
        </div>
    );
};
