'use client';

import React, { useState } from 'react';
import {
  BarChart4, FileInput, Activity, LayoutDashboard, List,
  TrendingUp, TrendingDown, Target, LineChart, Zap, Search, Table2
} from 'lucide-react';

import { DropZone } from '@/components/ingest/DropZone';
import { KPICard } from '@/components/dashboard/KPICard';
import { DistributionChart } from '@/components/dashboard/DistributionChart';
import { TransactionTable } from '@/components/ledger/TransactionTable';
import { RunwayChart } from '@/components/projections/RunwayChart';
import { NotificationPanel } from '@/components/ui/NotificationPanel';
import type { Notification } from '@/components/ui/NotificationPanel';
import { parseFinancialFile } from '@/lib/ingest/excelProcessor';
import { uploadPdfToWebhook } from '@/lib/ingest/pdfPipeline';
import { autoCategorizeAll } from '@/lib/finance/categorizer';

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { UserMenu } from '@/components/ui/UserMenu';
import { Database } from '@/types/database.types';

type TransactionRow = Database['public']['Tables']['transactions']['Row'];
type TransactionInsert = Database['public']['Tables']['transactions']['Insert'];

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions'>('dashboard');
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false });

      if (error) console.error('Error fetching transactions:', error);
      else setTransactions(autoCategorizeAll(data || []));

      setLoading(false);
    };

    init();
  }, [router]);

  // Derived Metrics
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + Number(t.amount || 0), 0);
  const totalExpense = Math.abs(transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + Number(t.amount || 0), 0));
  const profit = totalIncome - totalExpense;
  const margin = totalIncome ? (profit / totalIncome) * 100 : 0;

  // Monthly aggregation for charts
  const monthlyAgg = React.useMemo(() => {
    const buckets: Record<string, { income: number; expense: number }> = {};
    transactions.forEach(t => {
      if (!t.date) return;
      const key = String(t.date).slice(0, 7); // YYYY-MM
      if (!buckets[key]) buckets[key] = { income: 0, expense: 0 };
      if (t.type === 'income' || t.amount > 0) buckets[key].income += Math.abs(Number(t.amount) || 0);
      else buckets[key].expense += Math.abs(Number(t.amount) || 0);
    });
    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, values]) => ({ month, ...values }));
  }, [transactions]);

  const averageMonthlyNet = monthlyAgg.length
    ? monthlyAgg.reduce((acc, m) => acc + (m.income - m.expense), 0) / monthlyAgg.length
    : 0;

  const currentBalance = transactions.reduce((acc, t) => acc + Number(t.amount || 0), 0);

  const runwayProjection = React.useMemo(() => {
    const formatMonth = (d: Date) => d.toLocaleString('es-ES', { month: 'short' }).replace('.', '');

    const baseDate = transactions.reduce<Date>((latest, t) => {
      const d = new Date(t.date);
      return isNaN(d.getTime()) || d <= latest ? latest : d;
    }, new Date());

    const months: string[] = [formatMonth(baseDate)];
    for (let i = 1; i <= 6; i++) {
      const d = new Date(baseDate);
      d.setMonth(d.getMonth() + i);
      months.push(formatMonth(d));
    }

    const data: number[] = [];
    let balance = currentBalance;
    data.push(balance); // current balance
    for (let i = 1; i < months.length; i++) {
      balance += averageMonthlyNet;
      data.push(balance);
    }

    return { months, data };
  }, [transactions, currentBalance, averageMonthlyNet]);

  const incomeDistribution = React.useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach(t => {
      if (t.type !== 'income' && t.amount <= 0) return;
      const key = t.category || 'Sin Categoria';
      map.set(key, (map.get(key) || 0) + Math.abs(Number(t.amount) || 0));
    });
    const result = Array.from(map.entries()).map(([label, value]) => ({ label, value }));
    return result.length ? result : [{ label: 'Sin datos', value: 0 }];
  }, [transactions]);

  const expenseDistribution = React.useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach(t => {
      if (t.type === 'income' && t.amount >= 0) return;
      const key = t.category || 'Sin Categoria';
      map.set(key, (map.get(key) || 0) + Math.abs(Number(t.amount) || 0));
    });
    const result = Array.from(map.entries()).map(([label, value]) => ({ label, value }));
    return result.length ? result : [{ label: 'Sin datos', value: 0 }];
  }, [transactions]);

  // Calculate MoM Growth (Income based)
  const momGrowth = React.useMemo(() => {
    if (monthlyAgg.length < 2) return 0;
    const current = monthlyAgg[monthlyAgg.length - 1];
    const previous = monthlyAgg[monthlyAgg.length - 2];
    if (previous.income === 0) return current.income > 0 ? 100 : 0;
    return ((current.income - previous.income) / previous.income) * 100;
  }, [monthlyAgg]);

  // Detect Anomalies (Simple: Outliers > 3x Avg Expense)
  const anomalies = React.useMemo(() => {
    const alerts: { title: string; message: string; type: 'warning' | 'info' }[] = [];

    // Filter expenses
    const expenses = transactions.filter(t => t.type === 'expense' || (t.amount < 0 && t.type !== 'income'));

    if (expenses.length > 5) {
      const avgExpense = Math.abs(expenses.reduce((acc, t) => acc + Number(t.amount), 0) / expenses.length);

      // Find outliers, largest first, and dedupe by description+amount+date to avoid duplicates
      const outliers = expenses
        .filter(t => Math.abs(Number(t.amount)) > avgExpense * 3)
        .sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)));

      const seen = new Set<string>();
      for (const t of outliers) {
        const normalizedDesc = (t.description || '').trim().toLowerCase();
        const amountCents = Math.round(Math.abs(Number(t.amount)) * 100);
        const key = `${normalizedDesc}|${amountCents}`;
        if (seen.has(key)) continue;
        seen.add(key);

        alerts.push({
          title: "Gasto Inusual",
          message: `${t.description || 'Gasto'} (${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Math.abs(t.amount))}) supera 3x el promedio.`,
          type: 'warning'
        });

        if (alerts.length >= 3) break;
      }
    }

    if (alerts.length === 0 && transactions.length > 0) {
      alerts.push({ title: "Todo en orden", message: "No se han detectado anomalías recientes.", type: 'info' });
    }

    return alerts;
    return alerts;
  }, [transactions]);

  // Generate Notifications (Anomalies + System Alerts)
  const notifications = React.useMemo<Notification[]>(() => {
    const list: Notification[] = [];

    // 1. Add Anomalies
    anomalies.filter(a => a.type === 'warning').forEach((a, i) => {
      list.push({
        id: `anom-${i}`,
        type: 'danger',
        title: a.title,
        message: a.message,
        timestamp: 'Hace un momento'
      });
    });

    // 2. Runway Alert
    if (averageMonthlyNet < 0 && transactions.length > 0) {
      const burnRate = Math.abs(averageMonthlyNet);
      const monthsLeft = currentBalance / burnRate;

      if (monthsLeft < 6) {
        list.push({
          id: 'runway-1',
          type: 'warning',
          title: 'Runway Crítico / Cash Flow Negativo',
          message: `Al ritmo actual (${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(burnRate)}/mes), tienes caja para ${monthsLeft.toFixed(1)} meses.`,
          timestamp: 'Calculado ahora'
        });
      }
    }

    if (list.length === 0) {
      list.push({
        id: 'empty',
        type: 'info',
        title: 'Sistema Actualizado',
        message: 'Todo parece estar en orden. No hay alertas críticas.',
        timestamp: 'Ahora mismo'
      });
    }

    return list;
  }, [anomalies, averageMonthlyNet, currentBalance, transactions]);

  const handleFileIngest = async (file: File) => {
    try {
      if (file.type === 'application/pdf') {
        await uploadPdfToWebhook(file);
      } else {
        const parsed = await parseFinancialFile(file);

        if (parsed.length === 0) {
          alert("No se encontraron transacciones. Verifique que el Excel tenga columnas como 'Fecha', 'Importe', 'Concepto'.");
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;

        if (!userId) {
          alert("Debes iniciar sesión para importar datos.");
          return;
        }

        const dataToInsert: TransactionInsert[] = parsed.map(t => ({
          ...t,
          user_id: userId,
          type: t.amount < 0 ? 'expense' : 'income'
        }));

        const { error } = await supabase
          .from('transactions')
          .insert<TransactionInsert>(dataToInsert);

        if (error) {
          console.error('Error saving to DB:', error);
          alert(`Error al guardar en base de datos: ${error.message}`);
        } else {
          alert(`Importación exitosa. Se añadieron ${dataToInsert.length} movimientos.`);
          const { data } = await supabase.from('transactions').select('*').order('date', { ascending: false });
          setTransactions(autoCategorizeAll(data || []));
        }
      }
    } catch (e) {
      console.error(e);
    }
  };



  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 text-slate-100 min-h-screen">
      <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* --- SIDEBAR (3 cols) --- */}
        <aside className="lg:col-span-3 space-y-6">
          <div className="glass-panel p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-500/30">
                <BarChart4 className="text-white" size={24} />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">CFO Nexus</h1>
                <p className="text-xs text-slate-400">Inteligencia Financiera</p>
              </div>
            </div>
          </div>

          <div className="glass-panel p-6">
            <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <FileInput size={16} /> Importar Datos
            </h3>
            <div className="cursor-pointer">
              <DropZone onFileAccepted={handleFileIngest} />
            </div>
          </div>

          <div className="glass-panel p-6">
            <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
              <Activity size={16} className="text-slate-400" /> Salud Financiera
            </h3>
            <div className="space-y-3">
              <StatusCard
                label="Crecimiento (MoM)"
                value={transactions.length === 0 ? "Sin datos" : `${momGrowth > 0 ? '+' : ''}${momGrowth.toFixed(1)}% vs mes anterior`}
                color={transactions.length === 0 ? 'yellow' : momGrowth >= 0 ? 'green' : 'red'}
              />
              <StatusCard
                label="Margen Beneficio"
                value={transactions.length === 0 ? "Sin datos" : `${margin.toFixed(1)}% promedio`}
                color={transactions.length === 0 ? 'yellow' : margin > 20 ? 'green' : margin > 0 ? 'yellow' : 'red'}
              />
              <StatusCard
                label="Cash Flow (Medio)"
                value={transactions.length === 0 ? "Sin datos" : `${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(averageMonthlyNet)} / mes`}
                color={transactions.length === 0 ? 'yellow' : averageMonthlyNet >= 0 ? 'green' : 'red'}
              />
            </div>
          </div>
        </aside>

        {/* --- MAIN CONTENT (9 cols) --- */}
        <main className="lg:col-span-9 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex space-x-2 bg-slate-800/50 p-1 rounded-xl border border-white/5">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                <LayoutDashboard size={16} /> Visión General
              </button>
              <button
                onClick={() => setActiveTab('transactions')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${activeTab === 'transactions' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                <List size={16} /> Movimientos
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsNotificationsOpen(true)}
                className="text-slate-500 hover:text-blue-400 flex items-center gap-1 p-2 relative"
              >
                <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                <span className="text-xs hidden md:inline">Alertas</span>
              </button>
              <UserMenu />
            </div>
          </div>

          {activeTab === 'dashboard' && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <KPICard
                  title="Ingresos Totales"
                  value={new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(totalIncome)}
                  icon={<TrendingUp size={64} className="text-green-400" />}
                  progressColor="green"
                  progressValue={75}
                />
                <KPICard
                  title="Gastos Totales"
                  value={new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(totalExpense)}
                  icon={<TrendingDown size={64} className="text-red-400" />}
                  progressColor="red"
                  progressValue={45}
                />
                <div className="glass-panel p-4 flex flex-col justify-between h-32 bg-blue-900/10 border-blue-500/20">
                  <p className="text-blue-300 text-xs font-medium uppercase">Beneficio Neto</p>
                  <h2 className="text-3xl font-bold text-blue-50">{new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(profit)}</h2>
                  <p className="text-xs text-blue-400">Margen: {margin.toFixed(1)}%</p>
                </div>
                <div className="glass-panel p-4 flex flex-col justify-center items-center text-center relative border border-green-500/30 bg-green-900/10">
                  <Target className="w-8 h-8 text-green-400 mb-2" />
                  <p className="text-xs text-slate-400">Punto de Equilibrio</p>
                  <p className="text-sm font-bold text-green-200 mt-1">En zona de beneficios!</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="glass-panel p-6 lg:col-span-2 flex flex-col overflow-hidden min-w-0">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                      <LineChart className="text-purple-400" size={16} /> Proyección de Tesorería
                    </h3>
                    <div className="text-xs px-2 py-1 bg-purple-500/20 text-purple-300 rounded border border-purple-500/30">
                      Simulación IA
                    </div>
                  </div>
                  <div className="h-[400px]">
                    <RunwayChart data={runwayProjection.data} months={runwayProjection.months} />
                  </div>
                </div>

                <div className="glass-panel p-6 flex flex-col overflow-hidden min-w-0">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                      Desglose
                    </h3>
                  </div>
                  <div className="h-[250px]">
                    <DistributionChart incomeData={incomeDistribution} expenseData={expenseDistribution} />
                  </div>
                </div>
              </div>

              <div className="glass-panel p-6">
                <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                  <Zap className="text-yellow-400" size={16} /> Alertas y Anomalías
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {anomalies.map((alert, idx) => (
                    <div key={idx} className={`p-4 rounded-lg border flex items-start gap-3 ${alert.type === 'warning' ? 'bg-slate-800/40 border-yellow-500/30' : 'bg-slate-800/20 border-blue-500/20'}`}>
                      {alert.type === 'warning' ? (
                        <Zap className="w-5 h-5 mt-0.5 shrink-0 text-yellow-400" />
                      ) : (
                        <Activity className="w-5 h-5 mt-0.5 shrink-0 text-blue-400" />
                      )}
                      <div>
                        <h4 className={`text-sm font-bold ${alert.type === 'warning' ? 'text-slate-200' : 'text-blue-200'}`}>{alert.title}</h4>
                        <p className="text-xs text-slate-400 mt-1">{alert.message}</p>
                      </div>
                    </div>
                  ))}
                  {transactions.length === 0 && (
                    <div className="p-4 rounded-lg bg-slate-800/20 border border-white/5 text-center text-slate-500 text-xs col-span-full">
                      Importa datos para ver análisis de anomalías.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'transactions' && (
            <div className="glass-panel p-6 animate-slide-up">
              <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                  <Table2 className="text-blue-400" size={16} /> Detalle de Movimientos
                </h3>
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                  <input type="text" placeholder="Buscar concepto..." className="w-full bg-slate-900/50 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              <TransactionTable initialData={transactions} />
            </div>
          )}
        </main>
      </div>

      <NotificationPanel isOpen={isNotificationsOpen} onClose={() => setIsNotificationsOpen(false)} notifications={notifications} />
    </div>
  );
}

function StatusCard({ label, value, color }: { label: string, value: string, color: 'green' | 'yellow' | 'red' }) {
  const borderColor = color === 'green' ? 'border-emerald-500' : color === 'yellow' ? 'border-amber-500' : 'border-red-500';
  const lightColor = color === 'green' ? 'bg-emerald-500 shadow-emerald-500/50' : color === 'yellow' ? 'bg-amber-500 shadow-amber-500/50' : 'bg-red-500 shadow-red-500/50';
  const textColor = color === 'green' ? 'text-emerald-400' : color === 'yellow' ? 'text-amber-400' : 'text-red-400';

  return (
    <div className={`p-3 rounded-lg bg-slate-800/50 flex justify-between items-center border-l-4 ${borderColor} transition-all`}>
      <div>
        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">{label}</p>
        <p className={`text-sm font-bold ${textColor}`}>{value}</p>
      </div>
      <div className={`w-3 h-3 rounded-full ${lightColor} shadow-sm`}></div>
    </div>
  )
}
