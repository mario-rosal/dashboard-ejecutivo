'use client';

import "@/lib/chartRegistry";
import { Line } from 'react-chartjs-2';
import { GlassCard } from "@/components/ui/GlassCard";
import { ChartOptions } from "chart.js";
import { AlertTriangle } from "lucide-react";

interface RunwayChartProps {
    data: number[]; // Projected balance for next 12 months
    months: string[];
}

export function RunwayChart({ data, months }: RunwayChartProps) {
    const zeroIndex = data.findIndex(v => v <= 0);
    const deathDate = zeroIndex !== -1 ? months[zeroIndex] : null;

    const chartData = {
        labels: months,
        datasets: [
            {
                label: 'Balance Proyectado',
                data: data,
                borderColor: '#8b5cf6', // violet-500
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                borderDash: [5, 5],
                tension: 0.4,
                fill: true,
                pointStyle: 'circle',
                pointRadius: 4,
                pointHoverRadius: 6,
            },
            {
                label: 'Línea Zero',
                data: Array(months.length).fill(0),
                borderColor: '#ef4444', // red-500
                borderWidth: 1,
                pointRadius: 0,
            }
        ],
    };

    const options: ChartOptions<'line'> = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: { usePointStyle: true, boxWidth: 8 }
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                backgroundColor: 'rgba(24, 24, 27, 0.9)',
                callbacks: {
                    label: (context) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(context.raw as number)
                }
            }
        },
        scales: {
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: {
                    callback: (value) =>
                        new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact' }).format(Number(value))
                }
            },
            x: { grid: { display: false } }
        }
    };

    return (
        <GlassCard className="p-6 h-[400px] w-full relative">
            <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold text-white">Proyección de Caja (12 Meses)</h3>
                {deathDate && (
                    <div className="flex items-center gap-2 px-3 py-1 rounded bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-bold animate-pulse">
                        <AlertTriangle size={14} />
                        <span>Sin caja para {deathDate}</span>
                    </div>
                )}
            </div>
            <div className="relative w-full flex-1 min-h-0 overflow-hidden">
                <Line data={chartData} options={options} className="w-full h-full" />
            </div>
        </GlassCard>
    );
}
