'use client';

import "@/lib/chartRegistry";
import { Line } from 'react-chartjs-2';
import { GlassCard } from "@/components/ui/GlassCard";
import { ChartOptions } from "chart.js";

interface CashFlowChartProps {
    data: {
        labels: string[];
        income: number[];
        expenses: number[];
        balance: number[];
    };
}

export function CashFlowChart({ data }: CashFlowChartProps) {
    const chartData = {
        labels: data.labels,
        datasets: [
            {
                label: 'Ingresos',
                data: data.income,
                borderColor: '#3b82f6', // blue-500
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4,
                fill: true,
            },
            {
                label: 'Gastos',
                data: data.expenses,
                borderColor: '#ef4444', // red-500
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.4,
                fill: true,
            },
            {
                label: 'Balance Neto',
                data: data.balance,
                borderColor: '#8b5cf6', // purple-500
                borderDash: [5, 5],
                tension: 0.4,
                fill: false,
            }
        ],
    };

    const options: ChartOptions<'line'> = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    usePointStyle: true,
                    boxWidth: 8,
                }
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                backgroundColor: 'rgba(24, 24, 27, 0.9)', // zinc-900
                titleColor: '#fafafa',
                bodyColor: '#e4e4e7',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                padding: 10,
                cornerRadius: 8,
            }
        },
        scales: {
            y: {
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)',
                },
                ticks: {
                    callback: (value) =>
                        new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact' }).format(Number(value))
                }
            },
            x: {
                grid: {
                    display: false
                }
            }
        }
    };

    return (
        <GlassCard className="p-6 h-[400px] w-full flex flex-col">
            <h3 className="text-lg font-semibold mb-4 text-white">Evolución de Caja</h3>
            <div className="relative w-full flex-1 min-h-0 overflow-hidden">
                <Line data={chartData} options={options} className="w-full h-full" />
            </div>
        </GlassCard>
    );
}
