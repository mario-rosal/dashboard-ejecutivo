'use client';

import "@/lib/chartRegistry";
import { Doughnut } from 'react-chartjs-2';
import { GlassCard } from "@/components/ui/GlassCard";
import { ChartOptions } from "chart.js";
import { useState } from "react";

interface DistributionChartProps {
    incomeData: { label: string; value: number }[];
    expenseData: { label: string; value: number }[];
}

export function DistributionChart({ incomeData, expenseData }: DistributionChartProps) {
    const [mode, setMode] = useState<'income' | 'expenses'>('expenses');

    const currentData = mode === 'income' ? incomeData : expenseData;
    const total = currentData.reduce((acc, curr) => acc + curr.value, 0);

    // Reference palette
    const colors = [
        '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#6366f1'
    ];

    const chartData = {
        labels: currentData.map(d => d.label),
        datasets: [{
            data: currentData.map(d => d.value),
            backgroundColor: colors,
            borderColor: '#18181b', // Card background color
            borderWidth: 2,
        }]
    };

    const options: ChartOptions<'doughnut'> = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '75%',
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                callbacks: {
                    label: function (context) {
                        return context.label + ': ' + new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(context.raw as number);
                    }
                }
            }
        }
    };

    return (
        <GlassCard className="p-6 h-[400px] w-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white">Distribución</h3>
                {/* Mode Toggles */}
                <div className="flex gap-1 bg-slate-800/50 p-1 rounded-full border border-white/5">
                    <button
                        onClick={() => setMode('expenses')}
                        className={`text-[10px] px-3 py-1 rounded-full transition-all ${mode === 'expenses' ? 'bg-red-500/20 text-red-200 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Gastos
                    </button>
                    <button
                        onClick={() => setMode('income')}
                        className={`text-[10px] px-3 py-1 rounded-full transition-all ${mode === 'income' ? 'bg-emerald-500/20 text-emerald-200 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Ingresos
                    </button>
                </div>
            </div>

            <div className="relative flex-1 w-full min-h-0">
                <Doughnut data={chartData} options={options} />

                {/* Center Text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                        {mode === 'income' ? 'Total' : 'Total'}
                    </span>
                    <span className="text-xl font-bold text-white tracking-tight">
                        {new Intl.NumberFormat('es-ES', {
                            style: 'currency',
                            currency: 'EUR',
                            maximumFractionDigits: 0,
                            notation: 'compact'
                        }).format(total)}
                    </span>
                </div>
            </div>
        </GlassCard>
    );
}
