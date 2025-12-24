'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
    ColumnDef,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
    flexRender,
    SortingState,
} from '@tanstack/react-table';
import { Database } from '@/types/database.types';
import { GlassCard } from '@/components/ui/GlassCard';
import { ArrowUpDown, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { EditableCell } from './EditableCell';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';

const CATEGORY_OPTIONS = [
    'Infraestructura',
    'Software & IA',
    'Equipo & Nominas',
    'Marketing & Publicidad',
    'Impuestos & Legal',
    'Oficina & Suministros',
    'Viajes & Transporte',
    'Comisiones Bancarias',
    'Ventas Consultoria',
    'Ventas Licencias',
    'Devoluciones',
    'Otros Ingresos',
    'General',
    'Sin Categoria'
];

// Using the strict type for Row, but allowing partials for UI
type Transaction = Database['public']['Tables']['transactions']['Row'];

interface TransactionTableProps {
    initialData?: Transaction[];
}

export function TransactionTable({ initialData = [] }: TransactionTableProps) {
    const [data, setData] = useState<Transaction[]>(initialData);
    const [sorting, setSorting] = useState<SortingState>([]);
    const [globalFilter, setGlobalFilter] = useState('');

    // Sync local data when parent provides new transactions
    useEffect(() => {
        setData(initialData);
    }, [initialData]);

    // Update local state when cell is edited
    const updateData = (rowIndex: number, columnId: keyof Transaction, value: any) => {
        setData((old) =>
            old.map((row, index) => {
                if (index === rowIndex) {
                    const updated = {
                        ...old[rowIndex]!,
                        [columnId]: value,
                    } as Transaction;

                    // Fire and forget update to DB
                    // In real app, we'd handle loading/error states
                    if (row.id) {
                        const updates: Partial<Transaction> = { [columnId]: value };
                        supabase.from('transactions').update(updates).eq('id', row.id).then(({ error }) => {
                            if (error) console.error("Update failed", error);
                        });
                    }

                    return updated;
                }
                return row;
            })
        );
    };

    const columns = useMemo<ColumnDef<Transaction>[]>(
        () => [
            {
                accessorKey: 'date',
                header: ({ column }) => {
                    return (
                        <button
                            className="flex items-center hover:text-emerald-400"
                            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                        >
                            Fecha
                            <ArrowUpDown className="ml-2 h-3 w-3" />
                        </button>
                    )
                },
                cell: ({ getValue }) => <div className="text-zinc-400">{getValue() as string}</div>,
            },
            {
                accessorKey: 'description',
                header: 'Concepto',
                cell: ({ getValue, row, column }) => (
                    <EditableCell
                        value={getValue() as string}
                        onSave={(val) => updateData(row.index, column.id, val)}
                    />
                ),
            },
            {
                accessorKey: 'category',
                header: 'Categoría',
                cell: ({ getValue, row, column }) => (
                    <EditableCell
                        value={getValue() as string}
                        type="select"
                        options={CATEGORY_OPTIONS}
                        onSave={(val) => updateData(row.index, column.id, val)}
                    />
                ),
            },
            {
                accessorKey: 'amount',
                header: ({ column }) => (
                    <button
                        className="flex items-center hover:text-emerald-400 justify-end w-full"
                        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    >
                        Importe
                        <ArrowUpDown className="ml-2 h-3 w-3" />
                    </button>
                ),
                cell: ({ getValue, row, column }) => {
                    const amount = getValue() as number;
                    const type = row.original.type;
                    const isExpense = type === 'expense' || amount < 0;

                    return (
                        <div className={cn("text-right font-medium", isExpense ? "text-red-400" : "text-emerald-400")}>
                            <EditableCell
                                value={Math.abs(amount)} // Show positive for editing, color indicates sign
                                type="currency"
                                onSave={(val) => updateData(row.index, column.id, isExpense ? -Math.abs(Number(val)) : Math.abs(Number(val)))}
                            />
                        </div>
                    )
                },
            },
        ],
        []
    );

    const table = useReactTable({
        data,
        columns,
        state: {
            sorting,
            globalFilter,
        },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    return (
        <GlassCard className="p-6">
            {/* Table Toolbar */}
            <div className="flex items-center justify-between py-4">
                <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-zinc-500" />
                    <input
                        placeholder="Buscar movimiento..."
                        value={globalFilter ?? ""}
                        onChange={(event) => setGlobalFilter(event.target.value)}
                        className="pl-8 pr-4 py-2 bg-zinc-900/50 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500 w-64 transition-colors"
                    />
                </div>
            </div>

            <div className="rounded-lg border border-zinc-800 overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-zinc-900/80 text-zinc-400 uppercase text-xs">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <th key={header.id} className="px-6 py-3 font-medium">
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(
                                                header.column.columnDef.header,
                                                header.getContext()
                                            )}
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <tr
                                    key={row.id}
                                    className={cn(
                                        "bg-transparent hover:bg-white/5 transition-colors group",
                                        (row.original as any).is_anomaly && "bg-red-500/5 hover:bg-red-500/10"
                                    )}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <td key={cell.id} className="px-6 py-4 relative">
                                            {(row.original as any).is_anomaly && cell.column.id === 'date' && (
                                                <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title="Anomaly Detected" />
                                            )}
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={columns.length} className="h-24 text-center text-zinc-500">
                                    Sin resultados.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-end space-x-2 py-4">
                <button
                    className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                >
                    <ChevronLeft size={16} />
                </button>
                <button
                    className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                >
                    <ChevronRight size={16} />
                </button>
            </div>
        </GlassCard>
    );
}
