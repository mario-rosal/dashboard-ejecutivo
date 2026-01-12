'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
    'Infra Cloud',
    'SaaS / Suscripciones',
    'Marketing',
    'Comisiones bancarias',
    'Intereses',
    'Impuestos / SS',
    'Transferencias',
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
type TransactionUpdate = Database['public']['Tables']['transactions']['Update'];
type TransactionRow = Transaction & { is_anomaly?: boolean };

type EditableFieldValueMap = {
    description: string;
    category: string;
    amount: number;
};

type EditableField = keyof EditableFieldValueMap;

interface TransactionTableProps {
    initialData?: TransactionRow[];
    onTransactionUpdate?: (transaction: TransactionRow) => void;
    filterValue?: string;
    onFilterChange?: (value: string) => void;
    showToolbar?: boolean;
}

export function TransactionTable({
    initialData = [],
    onTransactionUpdate,
    filterValue,
    onFilterChange,
    showToolbar = true,
}: TransactionTableProps) {
    const [data, setData] = useState<TransactionRow[]>(initialData);
    const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
    const [sorting, setSorting] = useState<SortingState>([]);
    const [globalFilter, setGlobalFilter] = useState(filterValue ?? '');

    // Sync local data when parent provides new transactions
    useEffect(() => {
        setData(initialData);
    }, [initialData]);

    useEffect(() => {
        if (filterValue !== undefined) {
            setGlobalFilter(filterValue);
        }
    }, [filterValue]);

    useEffect(() => {
        let active = true;

        supabase
            .from('categories')
            .select('id,name')
            .then(({ data: categoryRows, error }) => {
                if (!active) return;
                if (error) {
                    console.error('Category fetch failed', error);
                    return;
                }
                if (categoryRows) {
                    const sorted = [...categoryRows].sort((a, b) => a.name.localeCompare(b.name));
                    setCategories(sorted);
                }
            });

        return () => {
            active = false;
        };
    }, []);

    const categoryOptions = useMemo(() => {
        if (categories.length > 0) {
            return categories.map((category) => category.name);
        }
        return CATEGORY_OPTIONS;
    }, [categories]);

    const normalizeCategoryName = (value: string) =>
        String(value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();

    const categoryIdByName = useMemo(() => {
        const map = new Map<string, string>();
        for (const category of categories) {
            map.set(normalizeCategoryName(category.name), category.id);
        }
        return map;
    }, [categories]);

    const persistUpdate = useCallback(
        <T extends EditableField>(rowId: string, columnId: T, value: EditableFieldValueMap[T]) => {
            const updates: Partial<TransactionUpdate> = {};
            if (columnId === 'description') updates.description = String(value);
            if (columnId === 'amount') updates.amount = Number(value);

            supabase
                .from('transactions')
                .update(updates)
                .eq('id', rowId)
                .then(({ error }) => {
                    if (error) console.error("Update failed", error);
                });
        },
        []
    );

    const persistCategoryUpdate = useCallback(
        async (rowId: string, categoryName: string, applyToMerchant: boolean) => {
            const categoryId = categoryIdByName.get(normalizeCategoryName(categoryName));
            if (!categoryId) {
                console.error('Category not found for update', categoryName);
                return { ok: false as const };
            }

            const res = await fetch(`/api/transactions/${rowId}/category`, {
                method: 'PATCH',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    category_id: categoryId,
                    apply_to_merchant: applyToMerchant,
                    scope: 'user',
                }),
            });

            if (!res.ok) {
                console.error('Category update failed', await res.text());
                return { ok: false as const };
            }

            return { ok: true as const, categoryId };
        },
        [categoryIdByName]
    );

    // Update local state when cell is edited
    const updateData = useCallback(
        <T extends EditableField>(rowIndex: number, columnId: T, value: EditableFieldValueMap[T]) => {
            if (columnId === 'category') {
                const row = data[rowIndex];
                if (!row?.id) return;

                const applyToMerchant = Boolean(row.merchant_normalized);
                persistCategoryUpdate(row.id, String(value), applyToMerchant).then((result) => {
                    if (!result.ok) return;
                    const updatedRow: TransactionRow = {
                        ...row,
                        category: String(value),
                        category_id: result.categoryId,
                        category_source: 'user',
                    };
                    setData((old) =>
                        old.map((rowItem, index) =>
                            index === rowIndex
                                ? {
                                    ...rowItem,
                                    category: String(value),
                                    category_id: result.categoryId,
                                    category_source: 'user',
                                }
                                : rowItem
                        )
                    );
                    onTransactionUpdate?.(updatedRow);
                });
                return;
            }

            const currentRow = data[rowIndex];
            if (!currentRow) return;
            const updatedRow: TransactionRow = {
                ...currentRow,
                [columnId]: value,
            };
            setData((old) =>
                old.map((row, index) => {
                    if (index === rowIndex) {
                        const updated: TransactionRow = {
                            ...row,
                            [columnId]: value,
                        };

                        // Fire and forget update to DB
                        // In real app, we'd handle loading/error states
                        if (row.id) {
                            persistUpdate(row.id, columnId, value);
                        }

                        return updated;
                    }
                    return row;
                })
            );
            onTransactionUpdate?.(updatedRow);
        },
        [data, onTransactionUpdate, persistCategoryUpdate, persistUpdate]
    );

    const columnWidthClass = useCallback((columnId: string) => {
        switch (columnId) {
            case 'date':
                return 'w-[12%] min-w-[110px] whitespace-nowrap';
            case 'description':
                return 'w-[52%] min-w-[320px]';
            case 'category':
                return 'w-[24%] min-w-[180px]';
            case 'amount':
                return 'w-[12%] min-w-[120px] whitespace-nowrap';
            default:
                return '';
        }
    }, []);

    const columns = useMemo<ColumnDef<TransactionRow>[]>(
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
                cell: ({ getValue, row }) => (
                    <EditableCell
                        value={getValue() as string}
                        containerClassName="w-full"
                        displayClassName="max-w-[520px]"
                        inputClassName="w-full min-w-[280px]"
                        onSave={(val) => updateData(row.index, 'description', String(val))}
                    />
                ),
            },
            {
                accessorKey: 'category',
                header: 'Categoría',
                cell: ({ getValue, row }) => (
                    <EditableCell
                        value={getValue() as string}
                        type="select"
                        options={categoryOptions}
                        containerClassName="w-full"
                        displayClassName="max-w-[260px]"
                        inputClassName="w-full max-w-[240px]"
                        onSave={(val) => updateData(row.index, 'category', String(val))}
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
                cell: ({ getValue, row }) => {
                    const amount = getValue() as number;
                    const type = row.original.type;
                    const isExpense = type === 'expense' || amount < 0;

                    return (
                        <div className={cn("text-right font-medium", isExpense ? "text-red-400" : "text-emerald-400")}>
                            <EditableCell
                                value={Math.abs(amount)} // Show positive for editing, color indicates sign
                                type="currency"
                                onSave={(val) => updateData(row.index, 'amount', isExpense ? -Math.abs(Number(val)) : Math.abs(Number(val)))}
                            />
                        </div>
                    )
                },
            },
        ],
        [updateData]
    );

    // TanStack Table exposes unstable callbacks; safe to ignore for React Compiler
    // eslint-disable-next-line react-hooks/incompatible-library
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
            {showToolbar && (
                <div className="flex items-center justify-between py-4">
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-zinc-500" />
                        <input
                            placeholder="Buscar movimiento..."
                            value={globalFilter ?? ""}
                            onChange={(event) => {
                                setGlobalFilter(event.target.value);
                                onFilterChange?.(event.target.value);
                            }}
                            className="pl-8 pr-4 py-2 bg-zinc-900/50 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500 w-64 transition-colors"
                        />
                    </div>
                </div>
            )}

            <div className="rounded-lg border border-zinc-800 overflow-hidden">
                <table className="w-full text-sm text-left table-fixed">
                    <thead className="bg-zinc-900/80 text-zinc-400 uppercase text-xs">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <th
                                        key={header.id}
                                        className={cn("px-6 py-3 font-medium", columnWidthClass(header.column.id))}
                                    >
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
                                        row.original.is_anomaly && "bg-red-500/5 hover:bg-red-500/10"
                                    )}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <td
                                            key={cell.id}
                                            className={cn("px-6 py-4 relative", columnWidthClass(cell.column.id))}
                                        >
                                            {row.original.is_anomaly && cell.column.id === 'date' && (
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
