'use client';

import { useState, useEffect } from "react";
import { Check, X } from "lucide-react";

interface EditableCellProps {
    value: string | number;
    onSave: (newValue: string | number) => void;
    type?: "text" | "number" | "currency" | "select";
    options?: string[]; // For select type
}

export function EditableCell({ value: initialValue, onSave, type = "text", options = [] }: EditableCellProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [value, setValue] = useState(initialValue);

    useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    const handleSave = () => {
        onSave(value);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setValue(initialValue);
        setIsEditing(false);
    };

    if (isEditing) {
        if (type === 'select') {
            return (
                <div className="flex items-center gap-1">
                    <select
                        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        autoFocus
                    >
                        {options.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}
                    </select>
                    <button onClick={handleSave} className="text-emerald-500 hover:text-emerald-400 p-0.5"><Check size={14} /></button>
                    <button onClick={handleCancel} className="text-red-500 hover:text-red-400 p-0.5"><X size={14} /></button>
                </div>
            );
        }

        return (
            <div className="flex items-center gap-1">
                <input
                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs w-24 text-white focus:outline-none focus:border-emerald-500"
                    value={value}
                    onChange={(e) => setValue(type === 'number' || type === 'currency' ? e.target.value : e.target.value)}
                    type={type === 'number' || type === 'currency' ? 'number' : 'text'}
                    autoFocus
                />
                <button onClick={handleSave} className="text-emerald-500 hover:text-emerald-400 p-0.5"><Check size={14} /></button>
                <button onClick={handleCancel} className="text-red-500 hover:text-red-400 p-0.5"><X size={14} /></button>
            </div>
        );
    }

    return (
        <div
            className="cursor-pointer hover:bg-white/5 px-2 py-1 rounded transition-colors group flex items-center gap-2"
            onClick={() => setIsEditing(true)}
        >
            <span className="truncate max-w-[150px]">
                {type === 'currency'
                    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value))
                    : value
                }
            </span>
            {/* Edit pencil hint on hover could go here */}
        </div>
    );
}
