'use client';

import React, { useState, useCallback } from 'react';
import { Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/GlassCard';

interface DropZoneProps {
    onFileAccepted: (file: File) => Promise<void>;
    accept?: string[]; // e.g. ['.csv', '.xlsx']
}

export function DropZone({ onFileAccepted, accept = ['.csv', '.xlsx', '.pdf'] }: DropZoneProps) {
    const [isDragActive, setIsDragActive] = useState(false);
    const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragActive(true);
        } else if (e.type === 'dragleave') {
            setIsDragActive(false);
        }
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);

        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;

        const file = files[0]; // Single file for now

        // Check extension
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        if (!accept.includes(ext)) {
            setStatus('error');
            setErrorMessage(`Format invalid. Accept: ${accept.join(', ')}`);
            setTimeout(() => setStatus('idle'), 3000);
            return;
        }

        try {
            setStatus('processing');
            await onFileAccepted(file);
            setStatus('success');
            setTimeout(() => setStatus('idle'), 3000);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Error processing file';
            setStatus('error');
            setErrorMessage(message);
        }
    }, [accept, onFileAccepted]);

    const onFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            try {
                setStatus('processing');
                await onFileAccepted(file);
                setStatus('success');
                setTimeout(() => setStatus('idle'), 3000);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Error processing file';
                setStatus('error');
                setErrorMessage(message);
            }
        }
    };

    return (
        <GlassCard
            className={cn(
                "p-4 transition-all duration-300 text-center cursor-pointer border-dashed border-2 bg-slate-800/30 hover:bg-slate-800/50",
                isDragActive ? "border-blue-500 bg-blue-500/10" : "border-slate-700",
                status === 'error' && "border-red-500/50",
                status === 'success' && "border-emerald-500/50"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-upload')?.click()}
        >
            <input
                id="file-upload"
                type="file"
                className="hidden"
                multiple={false}
                onChange={onFileInputChange}
                accept={accept.join(',')}
            />

            <div className="flex flex-col items-center justify-center gap-4">
                {status === 'idle' && (
                    <>
                        <div className="p-2 rounded-full bg-slate-700/50 text-slate-400 mx-auto">
                            <Upload size={24} />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-300">Excel (.xlsx) or CSV</p>
                            <p className="text-[10px] text-slate-500 mt-1">Drag file here</p>
                        </div>
                    </>
                )}

                {status === 'processing' && (
                    <div className="animate-in fade-in zoom-in duration-300">
                        <Loader2 size={48} className="animate-spin text-emerald-500 mx-auto" />
                        <p className="mt-4 text-emerald-200">Processing financial data...</p>
                    </div>
                )}

                {status === 'success' && (
                    <div className="animate-in fade-in zoom-in duration-300">
                        <div className="text-emerald-500 mx-auto mb-2">
                            <CheckCircle size={48} />
                        </div>
                        <p className="text-lg text-emerald-400">Import Successful!</p>
                    </div>
                )}

                {status === 'error' && (
                    <div className="animate-in fade-in zoom-in duration-300">
                        <div className="text-red-500 mx-auto mb-2">
                            <AlertCircle size={48} />
                        </div>
                        <p className="text-red-400 font-medium">Error</p>
                        <p className="text-sm text-red-300/80 mt-1">{errorMessage}</p>
                    </div>
                )}
            </div>
        </GlassCard>
    );
}
