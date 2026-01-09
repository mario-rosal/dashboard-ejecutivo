'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  BarChart4, FileInput, Activity, LayoutDashboard, List,
  TrendingUp, TrendingDown, Target, LineChart, Search, Table2
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
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

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
        .eq('user_id', session.user.id)
        .order('date', { ascending: false });

      if (error) console.error('Error fetching transactions:', error);
      else setTransactions(data || []);

      setLoading(false);
    };

    init();
  }, [router]);

  const fetchTransactionsForUser = React.useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', uid)
      .order('date', { ascending: false });

    if (error) {
      throw new Error(`Error fetching transactions: ${error.message}`);
    }

    setTransactions(data || []);
  }, []);

  const handleTransactionUpdate = React.useCallback((updated: TransactionRow) => {
    setTransactions((prev) =>
      prev.map((tx) => (tx.id === updated.id ? { ...tx, ...updated } : tx))
    );
  }, []);

  const hashFile = React.useCallback(async (file: File) => {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }, []);

  const countTransactionsForUser = React.useCallback(async (uid: string) => {
    const { count, error } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid);

    if (error) {
      throw new Error(`Error contando transacciones: ${error.message}`);
    }

    return count ?? 0;
  }, []);

  const waitForPdfProcessing = React.useCallback(async (uid: string, baselineCount: number) => {
    const maxWaitMs = 120000; // 2 minutes
    const pollIntervalMs = 3000;
    const started = Date.now();

    while (Date.now() - started < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      const currentCount = await countTransactionsForUser(uid);
      if (currentCount > baselineCount) {
        await fetchTransactionsForUser(uid);
        return;
      }
    }

    throw new Error('Seguimos procesando el PDF en n8n. Intenta refrescar en unos segundos.');
  }, [countTransactionsForUser, fetchTransactionsForUser]);

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

  const breakEvenWindow = 3;
  const recentMonths = monthlyAgg.slice(-breakEvenWindow);
  const recentNet = recentMonths.length
    ? recentMonths.reduce((acc, m) => acc + (m.income - m.expense), 0) / recentMonths.length
    : averageMonthlyNet;
  const breakEvenOk = recentNet >= 0;
  const breakEvenLabel = breakEvenOk ? 'Equilibrio alcanzado' : 'Equilibrio pendiente';
  const breakEvenMessage = breakEvenOk
    ? 'En zona de beneficios'
    : `Faltan ${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Math.abs(recentNet))}/mes`;
  const breakEvenDetail = recentMonths.length
    ? `Promedio ultimos ${recentMonths.length} meses`
    : 'Promedio historico';

  const currentBalance = transactions.reduce((acc, t) => acc + Number(t.amount || 0), 0);

  const runwayProjection = React.useMemo(() => {
    const formatMonthLabel = (d: Date) => {
      const month = d.toLocaleString('es-ES', { month: 'short' }).replace('.', '');
      const year = d.toLocaleString('es-ES', { year: '2-digit' });
      return `${month} '${year}`;
    };

    const sortedMonthly = [...monthlyAgg];
    const actualMonths: string[] = [];
    const actualBalances: number[] = [];
    let runningBalance = 0;

    sortedMonthly.forEach((m) => {
      const [year, month] = m.month.split('-').map(Number);
      const labelDate = new Date(year, (month || 1) - 1, 1);
      actualMonths.push(formatMonthLabel(labelDate));
      runningBalance += (m.income - m.expense);
      actualBalances.push(runningBalance);
    });

    if (actualMonths.length === 0) {
      const now = new Date();
      actualMonths.push(formatMonthLabel(now));
      actualBalances.push(currentBalance);
    }

    const lastActualBalance = actualBalances[actualBalances.length - 1] ?? currentBalance;
    const lastActualDate = (() => {
      if (sortedMonthly.length === 0) return new Date();
      const [year, month] = sortedMonthly[sortedMonthly.length - 1].month.split('-').map(Number);
      return new Date(year, (month || 1) - 1, 1);
    })();

    const forecastMonths: string[] = [];
    for (let i = 1; i <= 6; i++) {
      const d = new Date(lastActualDate);
      d.setMonth(d.getMonth() + i);
      forecastMonths.push(formatMonthLabel(d));
    }

    const labels = [...actualMonths, ...forecastMonths];
    const actualValues: (number | null)[] = [...actualBalances, ...Array(forecastMonths.length).fill(null)];
    const forecastValues: (number | null)[] = Array(labels.length).fill(null);

    // Seed forecast with the last real balance, then extend with projected monthly net
    const startIdx = actualMonths.length - 1;
    forecastValues[startIdx] = lastActualBalance;
    let projected = lastActualBalance;
    forecastMonths.forEach((_, idx) => {
      projected += averageMonthlyNet;
      forecastValues[startIdx + 1 + idx] = projected;
    });

    return { labels, actualValues, forecastValues };
  }, [monthlyAgg, currentBalance, averageMonthlyNet]);

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

  const handleGenerateInsight = async () => {
    if (!transactions.length) return;
    setAiLoading(true);
    setAiError(null);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setAiInsight(null);
      setAiError('Debes iniciar sesion para generar el insight.');
      setAiLoading(false);
      return;
    }

    const payload = {
      summary: {
        totalIncome,
        totalExpense,
        profit,
        margin,
        currentBalance,
        averageMonthlyNet,
      },
      monthlyAgg,
      topIncomeCategories: incomeDistribution.slice(0, 5),
      topExpenseCategories: expenseDistribution.slice(0, 5),
      warnings: anomalies.filter((a) => a.type === 'warning').map((a) => a.message),
    };

    try {
      const res = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setAiInsight(null);
        setAiError(data?.detail || data?.message || data?.error || `Error LLM (${res.status})`);
      } else {
        setAiInsight(data.insight);
      }
    } catch (e) {
      setAiInsight(null);
      setAiError(e instanceof Error ? e.message : 'Error generando insight');
    } finally {
      setAiLoading(false);
    }
  };

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
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      const accessToken = session?.access_token;

      if (!uid) {
        throw new Error("Debes iniciar sesi?n para importar datos.");
      }

      if (file.type === 'application/pdf') {
        const baselineCount = await countTransactionsForUser(uid);
        await uploadPdfToWebhook(file);
        await waitForPdfProcessing(uid, baselineCount);
        if (accessToken) {
          const res = await fetch('/api/transactions/categorize?force=false', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });
          if (!res.ok) {
            const text = await res.text();
            console.error('Categorization failed:', res.status, text);
          } else {
            await fetchTransactionsForUser(uid);
          }
        }
      } else {
        const parsed = await parseFinancialFile(file);

        if (parsed.length === 0) {
          alert("No se encontraron transacciones. Verifique que el Excel tenga columnas como 'Fecha', 'Importe', 'Concepto'.");
          return;
        }

        const fileHash = await hashFile(file);
        const { data: batch, error: batchError } = await supabase
          .from('import_batches')
          .insert({
            user_id: uid,
            bank_source: 'excel',
            file_name: file.name || 'upload',
            file_hash: fileHash,
            rows_total: parsed.length,
            rows_inserted: 0,
            rows_skipped: 0,
          })
          .select('id')
          .single();

        if (batchError || !batch) {
          console.error('Error creating import batch:', batchError);
          alert(`Error creando import batch: ${batchError?.message || 'sin detalle'}`);
          return;
        }

        const dataToInsert: TransactionInsert[] = parsed.map(t => ({
          ...t,
          user_id: uid,
          import_batch_id: batch.id,
          type: t.amount < 0 ? 'expense' : 'income'
        }));

        const { error } = await supabase
          .from('transactions')
          .insert<TransactionInsert>(dataToInsert);

        if (error) {
          console.error('Error saving to DB:', error);
          alert(`Error al guardar en base de datos: ${error.message}`);
        } else {
          const { error: batchUpdateError } = await supabase
            .from('import_batches')
            .update({ rows_inserted: dataToInsert.length })
            .eq('id', batch.id);

          if (batchUpdateError) {
            console.error('Error updating import batch:', batchUpdateError);
          }

          if (accessToken) {
            const res = await fetch(`/api/imports/${batch.id}/categorize?force=false`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            });
            if (!res.ok) {
              const text = await res.text();
              console.error('Categorization failed:', res.status, text);
            }
          }

          alert(`Importaci?n exitosa. Se a?adieron ${dataToInsert.length} movimientos.`);
          await fetchTransactionsForUser(uid);
        }
      }
    } catch (e) {
      console.error(e);
      throw e instanceof Error ? e : new Error('Error procesando archivo');
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
                <div
                  className={`glass-panel p-4 flex flex-col justify-center items-center text-center relative border ${breakEvenOk ? 'border-green-500/30 bg-green-900/10' : 'border-amber-500/30 bg-amber-900/10'}`}
                >
                  <Target className={`w-8 h-8 mb-2 ${breakEvenOk ? 'text-green-400' : 'text-amber-400'}`} />
                  <p className="text-xs text-slate-400">Punto de Equilibrio</p>
                  <p className={`text-sm font-bold mt-1 ${breakEvenOk ? 'text-green-200' : 'text-amber-200'}`}>
                    {breakEvenMessage}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">{breakEvenDetail}</p>
                  <p className={`text-[10px] uppercase tracking-wide mt-2 ${breakEvenOk ? 'text-green-300' : 'text-amber-300'}`}>
                    {breakEvenLabel}
                  </p>
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
                    <RunwayChart
                      labels={runwayProjection.labels}
                      actualValues={runwayProjection.actualValues}
                      forecastValues={runwayProjection.forecastValues}
                    />
                  </div>
                </div>

                <div className="glass-panel p-6 flex flex-col overflow-hidden min-w-0">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                      Desglose
                    </h3>
                  </div>
                  <div className="w-full">
                    <DistributionChart incomeData={incomeDistribution} expenseData={expenseDistribution} />
                  </div>
                </div>
              </div>

              <div className="glass-panel p-6">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <LineChart className="text-blue-400" size={16} /> Informe IA (Gemini)
                  </h3>
                  <button
                    onClick={handleGenerateInsight}
                    disabled={aiLoading || transactions.length === 0}
                    className={`px-3 py-2 text-sm rounded-lg border transition-colors ${aiLoading || transactions.length === 0
                      ? 'bg-slate-800/50 text-slate-500 border-slate-700 cursor-not-allowed'
                      : 'bg-blue-600 text-white border-blue-500 hover:bg-blue-500'
                      }`}
                  >
                    {aiLoading ? 'Generando...' : 'Generar insight'}
                  </button>
                </div>
                {aiError && <p className="text-sm text-red-400 mb-2">{aiError}</p>}
                <div className="rounded-lg border border-slate-800/60 bg-slate-900/40 p-4">
                  {aiInsight ? (
                    <div className="markdown-body text-sm text-slate-200 leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {aiInsight}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-300">
                      Pulsa el botón para generar un resumen accionable con tus métricas actuales.
                    </p>
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
              <TransactionTable initialData={transactions} onTransactionUpdate={handleTransactionUpdate} />
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
