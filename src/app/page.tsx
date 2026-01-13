'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  BarChart4, FileInput, Activity, LayoutDashboard, List, Bell,
  TrendingUp, TrendingDown, Target, LineChart, Search, Table2
} from 'lucide-react';

import { DropZone } from '@/components/ingest/DropZone';
import { KPICard } from '@/components/dashboard/KPICard';
import { DistributionChart } from '@/components/dashboard/DistributionChart';
import { TransactionTable } from '@/components/ledger/TransactionTable';
import { RunwayChart } from '@/components/projections/RunwayChart';
import { NotificationPanel } from '@/components/ui/NotificationPanel';
import type { Notification, NotificationAction } from '@/components/ui/NotificationPanel';
import { AlertSettingsPanel } from '@/components/alerts/AlertSettingsPanel';
import { parseFinancialFile } from '@/lib/ingest/excelProcessor';
import {
  ALERT_RULE_DEFINITIONS,
  type AlertRuleConfig,
  type AlertRuleKey,
} from '@/lib/alerts/definitions';

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { UserMenu } from '@/components/ui/UserMenu';
import { Database } from '@/types/database.types';

type TransactionRow = Database['public']['Tables']['transactions']['Row'];
type TransactionInsert = Database['public']['Tables']['transactions']['Insert'];
type AlertRuleRow = Database['public']['Tables']['alert_rules']['Row'];
type AlertExclusionRow = Database['public']['Tables']['alert_exclusions']['Row'];
type AlertEventRow = Database['public']['Tables']['alert_events']['Row'];

const currencyFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const formatCurrency = (value: number) => currencyFormatter.format(value);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const formatRelativeDays = (date: Date) => {
  const diffDays = Math.round((Date.now() - date.getTime()) / MS_PER_DAY);
  if (diffDays <= 0) return 'hoy';
  if (diffDays === 1) return 'hace 1 dia';
  if (diffDays < 7) return `hace ${diffDays} dias`;
  const weeks = Math.floor(diffDays / 7);
  if (weeks < 5) return `hace ${weeks} semanas`;
  const months = Math.floor(diffDays / 30);
  return `hace ${months} meses`;
};

const safeParseDate = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeText = (value: string | null | undefined) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

type AlertPayload = {
  filterValue?: string;
  merchant?: string;
  category?: string;
  description?: string;
  amount?: number;
};

type AlertSignal = {
  ruleKey: AlertRuleKey;
  dedupeKey: string;
  type: Notification['type'];
  title: string;
  message: string;
  detail?: string;
  eventAt?: string;
  payload?: AlertPayload;
  priority: number;
  impact?: number;
};

type AlertEventInput = {
  rule_key: string;
  dedupe_key: string;
  severity: Database['public']['Enums']['alert_severity'];
  title: string;
  message: string;
  detail?: string | null;
  event_at?: string;
  payload?: Database['public']['Tables']['alert_events']['Row']['payload'];
};

const acceptedFormatsLabel = '.csv, .xls, .xlsx';
const isPdfFile = (file: File) =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions'>('dashboard');
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isAlertSettingsOpen, setIsAlertSettingsOpen] = useState(false);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [transactionFilter, setTransactionFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [alertRules, setAlertRules] = useState<AlertRuleRow[]>([]);
  const [alertExclusions, setAlertExclusions] = useState<AlertExclusionRow[]>([]);
  const [alertEvents, setAlertEvents] = useState<AlertEventRow[]>([]);
  const [alertSettingsLoading, setAlertSettingsLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [summaryMode, setSummaryMode] = useState<'income' | 'expenses'>('expenses');

  React.useEffect(() => {
    setShowAllCategories(false);
  }, [summaryMode]);

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

  const fetchAlertSettings = React.useCallback(async (token: string) => {
    setAlertSettingsLoading(true);
    try {
      const [rulesRes, exclusionsRes] = await Promise.all([
        fetch('/api/alerts/rules', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
        fetch('/api/alerts/exclusions', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
      ]);

      const rulesPayload = await rulesRes.json();
      const exclusionsPayload = await exclusionsRes.json();

      if (rulesRes.ok && rulesPayload?.rules) {
        setAlertRules(rulesPayload.rules);
      }
      if (exclusionsRes.ok && exclusionsPayload?.exclusions) {
        setAlertExclusions(exclusionsPayload.exclusions.filter((exclusion: AlertExclusionRow) => exclusion.is_active));
      }
    } catch (error) {
      console.error('Error fetching alert settings:', error);
    } finally {
      setAlertSettingsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      setAccessToken(session.access_token);

      const [{ data, error }] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .eq('user_id', session.user.id)
          .order('date', { ascending: false }),
        fetchAlertSettings(session.access_token),
      ]);

      if (error) console.error('Error fetching transactions:', error);
      else setTransactions(data || []);

      setLoading(false);
    };

    init();
  }, [fetchAlertSettings, router]);

  const saveAlertRules = React.useCallback(
    async (token: string, rules: Array<{ rule_key: string; is_active: boolean; config: AlertRuleConfig }>) => {
      const res = await fetch('/api/alerts/rules', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rules }),
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'rules_update_failed');
      }

      if (payload?.rules) {
        setAlertRules(payload.rules);
      }
    },
    []
  );

  const addAlertExclusion = React.useCallback(
    async (
      token: string,
      exclusion: {
        match_type: string;
        match_value: string;
        rule_key?: string | null;
        min_amount?: number | null;
        max_amount?: number | null;
      }
    ) => {
      const res = await fetch('/api/alerts/exclusions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(exclusion),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'exclusion_insert_failed');
      }
      if (payload?.exclusion) {
        setAlertExclusions((prev) => [payload.exclusion, ...prev]);
      }
    },
    []
  );

  const removeAlertExclusion = React.useCallback(async (token: string, exclusionId: string) => {
    const res = await fetch(`/api/alerts/exclusions/${exclusionId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.error || 'exclusion_delete_failed');
    }
    setAlertExclusions((prev) => prev.filter((exclusion) => exclusion.id !== exclusionId));
  }, []);

  const updateAlertEventStatus = React.useCallback(
    async (token: string, eventId: string, status: 'open' | 'ignored' | 'dismissed') => {
      const res = await fetch(`/api/alerts/events/${eventId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'event_update_failed');
      }
      if (payload?.event) {
        setAlertEvents((prev) =>
          status === 'open' ? prev : prev.filter((event) => event.id !== payload.event.id)
        );
      }
    },
    []
  );

  const syncAlertEvents = React.useCallback(
    async (token: string, events: AlertEventInput[]) => {
      const res = await fetch('/api/alerts/sync', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ events }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'events_sync_failed');
      }
      if (payload?.events) {
        setAlertEvents(payload.events);
      }
    },
    []
  );

  const handleMarkRecurring = React.useCallback(
    async (event: AlertEventRow, payload: AlertPayload) => {
      if (!accessToken) return;
      const matchValue = payload.merchant || payload.category || payload.description;
      if (!matchValue) return;
      const matchType = payload.merchant ? 'merchant' : payload.category ? 'category' : 'description';

      try {
        await addAlertExclusion(accessToken, {
          match_type: matchType,
          match_value: matchValue,
          rule_key: event.rule_key,
        });
        await updateAlertEventStatus(accessToken, event.id, 'dismissed');
      } catch (error) {
        console.error('Error creating exclusion:', error);
      }
    },
    [accessToken, addAlertExclusion, updateAlertEventStatus]
  );

  const openTransactionsWithFilter = React.useCallback(
    (filterValue: string) => {
      setActiveTab('transactions');
      setTransactionFilter(filterValue);
      setIsNotificationsOpen(false);
    },
    [setActiveTab, setTransactionFilter, setIsNotificationsOpen]
  );

  const createFilterAction = React.useCallback(
    (label: string, filterValue: string) => ({
      label,
      onClick: () => openTransactionsWithFilter(filterValue),
      tone: 'primary' as const,
    }),
    [openTransactionsWithFilter]
  );

  const buildNotificationActions = React.useCallback(
    (event: AlertEventRow) => {
      if (!accessToken) return [];
      const payload =
        event.payload && typeof event.payload === 'object' ? (event.payload as AlertPayload) : ({} as AlertPayload);
      const actions: NotificationAction[] = [];

      if (payload.filterValue) {
        actions.push(createFilterAction('Ver movimientos', payload.filterValue));
      }

      if (payload.merchant || payload.category || payload.description) {
        actions.push({
          label: 'Marcar recurrente',
          tone: 'secondary' as const,
          onClick: () => {
            void handleMarkRecurring(event, payload);
          },
        });
      }

      actions.push({
        label: 'Ignorar',
        tone: 'secondary' as const,
        onClick: () => {
          void updateAlertEventStatus(accessToken, event.id, 'ignored');
        },
      });

      actions.push({
        label: 'Eliminar',
        tone: 'danger' as const,
        onClick: () => {
          void updateAlertEventStatus(accessToken, event.id, 'dismissed');
        },
      });

      return actions;
    },
    [accessToken, createFilterAction, handleMarkRecurring, updateAlertEventStatus]
  );

  const handleSaveAlertRules = React.useCallback(
    async (rules: Array<{ rule_key: AlertRuleKey; is_active: boolean; config: AlertRuleConfig }>) => {
      if (!accessToken) return;
      await saveAlertRules(
        accessToken,
        rules.map((rule) => ({
          rule_key: rule.rule_key,
          is_active: rule.is_active,
          config: rule.config,
        }))
      );
    },
    [accessToken, saveAlertRules]
  );

  const handleAddAlertExclusion = React.useCallback(
    async (exclusion: {
      match_type: string;
      match_value: string;
      rule_key?: string | null;
      min_amount?: number | null;
      max_amount?: number | null;
    }) => {
      if (!accessToken) return;
      await addAlertExclusion(accessToken, exclusion);
    },
    [accessToken, addAlertExclusion]
  );

  const handleRemoveAlertExclusion = React.useCallback(
    async (exclusionId: string) => {
      if (!accessToken) return;
      await removeAlertExclusion(accessToken, exclusionId);
    },
    [accessToken, removeAlertExclusion]
  );

  const ruleMap = React.useMemo(() => {
    const map = new Map<AlertRuleKey, AlertRuleRow>();
    alertRules.forEach((rule) => {
      if (ALERT_RULE_DEFINITIONS.find((def) => def.key === rule.rule_key)) {
        map.set(rule.rule_key as AlertRuleKey, rule);
      }
    });
    return map;
  }, [alertRules]);

  const getRuleConfig = React.useCallback(
    (ruleKey: AlertRuleKey) => {
      const definition = ALERT_RULE_DEFINITIONS.find((rule) => rule.key === ruleKey);
      const stored = ruleMap.get(ruleKey);
      const storedConfig =
        stored?.config && typeof stored.config === 'object' ? (stored.config as AlertRuleConfig) : {};
      return {
        isActive: stored?.is_active ?? true,
        config: {
          ...(definition?.defaultConfig ?? {}),
          ...storedConfig,
        },
      };
    },
    [ruleMap]
  );

  const activeExclusions = React.useMemo(
    () => alertExclusions.filter((exclusion) => exclusion.is_active),
    [alertExclusions]
  );

  const shouldExcludeAlert = React.useCallback(
    (ruleKey: AlertRuleKey, payload: AlertPayload) => {
      const amount = payload.amount ?? null;
      const merchant = payload.merchant ? normalizeText(payload.merchant) : '';
      const category = payload.category ? normalizeText(payload.category) : '';
      const description = payload.description ? normalizeText(payload.description) : '';

      return activeExclusions.some((exclusion) => {
        if (exclusion.rule_key && exclusion.rule_key !== ruleKey) return false;

        if (exclusion.match_type === 'merchant' && merchant !== exclusion.match_value_normalized) return false;
        if (exclusion.match_type === 'category' && category !== exclusion.match_value_normalized) return false;
        if (exclusion.match_type === 'description' && description !== exclusion.match_value_normalized) return false;

        if (exclusion.min_amount !== null && amount === null) return false;
        if (exclusion.min_amount !== null && amount !== null && amount < exclusion.min_amount) return false;
        if (exclusion.max_amount !== null && amount === null) return false;
        if (exclusion.max_amount !== null && amount !== null && amount > exclusion.max_amount) return false;

        return true;
      });
    },
    [activeExclusions]
  );

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
  const hasTotals = totalIncome > 0 || totalExpense > 0;
  const coveragePctRaw = totalExpense > 0 ? (totalIncome / totalExpense) * 100 : totalIncome > 0 ? 100 : 0;
  const expensePctRaw = totalIncome > 0 ? (totalExpense / totalIncome) * 100 : totalExpense > 0 ? 100 : 0;
  const coveragePct = Math.min(100, Math.max(0, coveragePctRaw));
  const expensePct = Math.min(100, Math.max(0, expensePctRaw));
  const incomeSubText = hasTotals ? `Cobertura de gastos: ${coveragePctRaw.toFixed(0)}%` : 'Sin datos';
  const expenseSubText = hasTotals ? `Peso sobre ingresos: ${expensePctRaw.toFixed(0)}%` : 'Sin datos';

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

  const expenseSummary = React.useMemo(() => {
    return expenseDistribution
      .filter((item) => item.label !== 'Sin datos' && item.value > 0)
      .map((item) => ({ label: item.label, value: item.value }))
      .sort((a, b) => {
        const diff = b.value - a.value;
        if (diff !== 0) return diff;
        return a.label.localeCompare(b.label);
      });
  }, [expenseDistribution]);

  const incomeSummary = React.useMemo(() => {
    return incomeDistribution
      .filter((item) => item.label !== 'Sin datos' && item.value > 0)
      .map((item) => ({ label: item.label, value: item.value }))
      .sort((a, b) => {
        const diff = b.value - a.value;
        if (diff !== 0) return diff;
        return a.label.localeCompare(b.label);
      });
  }, [incomeDistribution]);

  // Calculate MoM Growth (Income based)
  const momGrowth = React.useMemo(() => {
    if (monthlyAgg.length < 2) return 0;
    const current = monthlyAgg[monthlyAgg.length - 1];
    const previous = monthlyAgg[monthlyAgg.length - 2];
    if (previous.income === 0) return current.income > 0 ? 100 : 0;
    return ((current.income - previous.income) / previous.income) * 100;
  }, [monthlyAgg]);

  // Detect Alerts (Rules + Comparisons)
  const alertCandidates = React.useMemo<AlertSignal[]>(() => {
    if (transactions.length === 0) return [];

    const alerts: AlertSignal[] = [];
    const now = new Date();
    const windowStart = (days: number) => {
      const d = new Date(now);
      d.setDate(now.getDate() - days);
      return d;
    };
    const sumAbs = (items: Array<TransactionRow>) =>
      items.reduce((acc, t) => acc + Math.abs(Number(t.amount) || 0), 0);

    const dated = transactions
      .map((t) => {
        const dateObj = safeParseDate(t.date);
        return dateObj ? { ...t, dateObj } : null;
      })
      .filter(Boolean) as Array<TransactionRow & { dateObj: Date }>;

    const isExpense = (t: TransactionRow) => t.type === 'expense' || Number(t.amount) < 0;
    const isIncome = (t: TransactionRow) => t.type === 'income' || Number(t.amount) > 0;

    const expenses = dated.filter(isExpense);
    const incomes = dated.filter(isIncome);

    const expenseRule = getRuleConfig('expense_outlier');
    if (expenseRule.isActive && expenses.length > 0) {
      const windowDays = expenseRule.config.window_days ?? 90;
      const minAmount = expenseRule.config.min_amount ?? 0;
      const multiplier = expenseRule.config.multiplier ?? 3;
      const maxAlerts = expenseRule.config.max_alerts ?? 3;
      const start = windowStart(windowDays);
      const windowExpenses = expenses.filter((t) => t.dateObj >= start);
      if (windowExpenses.length > 5) {
        const avgExpense = Math.abs(
          windowExpenses.reduce((acc, t) => acc + Number(t.amount || 0), 0) / windowExpenses.length
        );

        if (avgExpense > 0) {
          const outliers = windowExpenses
            .filter((t) => Math.abs(Number(t.amount)) > avgExpense * multiplier)
            .sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)));

          const seen = new Set<string>();
          for (const t of outliers) {
            const desc =
              t.description || t.merchant_normalized || t.description_clean || t.description_raw || 'Movimiento';
            const normalizedDesc = normalizeText(desc);
            const amountCents = Math.round(Math.abs(Number(t.amount)) * 100);
            const key = `${normalizedDesc}|${amountCents}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const absAmount = Math.abs(Number(t.amount) || 0);
            if (absAmount < minAmount) continue;

            const payload = {
              description: desc,
              merchant: t.merchant_raw ?? t.merchant_normalized ?? undefined,
              category: t.category ?? undefined,
              amount: absAmount,
              filterValue: desc,
            };

            if (shouldExcludeAlert('expense_outlier', payload)) continue;

            alerts.push({
              ruleKey: 'expense_outlier',
              dedupeKey: t.id ?? `${key}|${String(t.date).slice(0, 10)}`,
              type: 'warning',
              title: 'Gasto inusual',
              message: `${desc} (${formatCurrency(absAmount)}) supera ${multiplier.toFixed(1)}x el promedio.`,
              detail: `Promedio: ${formatCurrency(avgExpense)} | Umbral: ${formatCurrency(avgExpense * multiplier)}`,
              eventAt: t.date,
              payload,
              priority: 90,
              impact: absAmount,
            });

            if (alerts.filter((alert) => alert.ruleKey === 'expense_outlier').length >= maxAlerts) break;
          }
        }
      }
    }

    const incomeRule = getRuleConfig('income_drop');
    if (incomeRule.isActive && incomes.length > 0) {
      const windowDays = incomeRule.config.window_days ?? 30;
      const baselineDays = incomeRule.config.baseline_days ?? windowDays;
      const minPct = incomeRule.config.min_pct ?? 0.2;
      const minAmount = incomeRule.config.min_amount ?? 500;
      const currentStart = windowStart(windowDays);
      const baselineStart = windowStart(windowDays + baselineDays);

      const currentIncome = incomes.filter((t) => t.dateObj >= currentStart);
      const baselineIncome = incomes.filter((t) => t.dateObj >= baselineStart && t.dateObj < currentStart);
      const currentTotal = sumAbs(currentIncome);
      const baselineTotal = sumAbs(baselineIncome);

      if (baselineTotal > 0) {
        const dropAmount = baselineTotal - currentTotal;
        const dropPct = dropAmount / baselineTotal;
        if (dropAmount >= minAmount && dropPct >= minPct) {
          alerts.push({
            ruleKey: 'income_drop',
            dedupeKey: `income-drop-${currentStart.toISOString().slice(0, 10)}`,
            type: dropPct >= 0.4 ? 'danger' : 'warning',
            title: 'Ingresos a la baja',
            message: `-${(dropPct * 100).toFixed(0)}% vs periodo anterior`,
            detail: `De ${formatCurrency(baselineTotal)} a ${formatCurrency(currentTotal)} (-${formatCurrency(dropAmount)})`,
            eventAt: currentStart.toISOString(),
            payload: {
              amount: dropAmount,
            },
            priority: 75,
            impact: dropAmount,
          });
        }
      }
    }

    const categoryRule = getRuleConfig('category_spike');
    if (categoryRule.isActive && expenses.length > 0) {
      const windowDays = categoryRule.config.window_days ?? 30;
      const baselineDays = categoryRule.config.baseline_days ?? windowDays;
      const minPct = categoryRule.config.min_pct ?? 0.5;
      const minAmount = categoryRule.config.min_amount ?? 200;
      const minTotal = categoryRule.config.min_total ?? 300;
      const currentStart = windowStart(windowDays);
      const baselineStart = windowStart(windowDays + baselineDays);

      const currentExpenses = expenses.filter((t) => t.dateObj >= currentStart);
      const baselineExpenses = expenses.filter((t) => t.dateObj >= baselineStart && t.dateObj < currentStart);

      if (currentExpenses.length > 0 && baselineExpenses.length > 0) {
        const categoryTotals = new Map<string, { current: number; baseline: number }>();

        for (const t of currentExpenses) {
          const key = t.category || 'Sin Categoria';
          const total = categoryTotals.get(key) || { current: 0, baseline: 0 };
          total.current += Math.abs(Number(t.amount) || 0);
          categoryTotals.set(key, total);
        }

        for (const t of baselineExpenses) {
          const key = t.category || 'Sin Categoria';
          const total = categoryTotals.get(key) || { current: 0, baseline: 0 };
          total.baseline += Math.abs(Number(t.amount) || 0);
          categoryTotals.set(key, total);
        }

        const spikes = Array.from(categoryTotals.entries())
          .filter(([category]) => normalizeText(category) !== 'sin categoria')
          .map(([category, totals]) => {
            const delta = totals.current - totals.baseline;
            const pct = totals.baseline > 0 ? delta / totals.baseline : 0;
            return { category, totals, delta, pct };
          })
          .filter((entry) => entry.totals.baseline > 0 && entry.delta >= minAmount && entry.pct >= minPct && entry.totals.current >= minTotal)
          .sort((a, b) => b.delta - a.delta)
          .slice(0, 2);

        spikes.forEach((entry) => {
          const payload = {
            category: entry.category,
            amount: entry.delta,
            filterValue: entry.category,
          };

          if (shouldExcludeAlert('category_spike', payload)) return;

          alerts.push({
            ruleKey: 'category_spike',
            dedupeKey: `category-spike-${normalizeText(entry.category)}-${currentStart.toISOString().slice(0, 10)}`,
            type: entry.pct >= 1 ? 'danger' : 'warning',
            title: `Gasto en ${entry.category} sube`,
            message: `+${(entry.pct * 100).toFixed(0)}% vs periodo anterior`,
            detail: `De ${formatCurrency(entry.totals.baseline)} a ${formatCurrency(entry.totals.current)} (+${formatCurrency(entry.delta)})`,
            eventAt: currentStart.toISOString(),
            payload,
            priority: 70,
            impact: entry.delta,
          });
        });
      }
    }

    const merchantRule = getRuleConfig('merchant_concentration');
    if (merchantRule.isActive && expenses.length > 0) {
      const windowDays = merchantRule.config.window_days ?? 30;
      const minShare = merchantRule.config.min_share ?? 0.4;
      const minTotal = merchantRule.config.min_total ?? 500;
      const minAmount = merchantRule.config.min_amount ?? 300;
      const currentStart = windowStart(windowDays);
      const currentExpenses = expenses.filter((t) => t.dateObj >= currentStart);
      const currentTotal = sumAbs(currentExpenses);

      if (currentTotal >= minTotal && currentExpenses.length > 0) {
        const merchantTotals = new Map<string, { display: string; total: number }>();

        for (const t of currentExpenses) {
          const display =
            t.merchant_normalized || t.description || t.description_clean || t.description_raw || 'Movimiento';
          const key = normalizeText(display);
          if (!key) continue;
          const total = merchantTotals.get(key) || { display, total: 0 };
          total.total += Math.abs(Number(t.amount) || 0);
          merchantTotals.set(key, total);
        }

        const topMerchant = Array.from(merchantTotals.values()).sort((a, b) => b.total - a.total)[0];
        if (topMerchant && topMerchant.total >= minAmount) {
          const share = topMerchant.total / currentTotal;
          if (share >= minShare) {
            const payload = {
              merchant: topMerchant.display,
              amount: topMerchant.total,
              filterValue: topMerchant.display,
            };

            if (!shouldExcludeAlert('merchant_concentration', payload)) {
              alerts.push({
                ruleKey: 'merchant_concentration',
                dedupeKey: `merchant-concentration-${normalizeText(topMerchant.display)}-${currentStart.toISOString().slice(0, 10)}`,
                type: share >= 0.6 ? 'danger' : 'warning',
                title: 'Alta concentracion de gasto',
                message: `${topMerchant.display} concentra ${(share * 100).toFixed(0)}% del gasto reciente`,
                detail: `Total: ${formatCurrency(topMerchant.total)} de ${formatCurrency(currentTotal)}`,
                eventAt: currentStart.toISOString(),
                payload,
                priority: 65,
                impact: topMerchant.total,
              });
            }
          }
        }
      }
    }

    const duplicateRule = getRuleConfig('duplicate_charge');
    if (duplicateRule.isActive && expenses.length > 0) {
      const windowDays = duplicateRule.config.window_days ?? 14;
      const minCount = duplicateRule.config.min_count ?? 2;
      const minTotal = duplicateRule.config.min_total ?? 200;
      const currentStart = windowStart(windowDays);

      const duplicateBuckets = new Map<
        string,
        { desc: string; amount: number; count: number; total: number; lastDate: Date }
      >();

      expenses
        .filter((t) => t.dateObj >= currentStart)
        .forEach((t) => {
          const desc =
            t.description || t.merchant_normalized || t.description_clean || t.description_raw || 'Movimiento';
          const absAmount = Math.abs(Number(t.amount) || 0);
          if (!desc || absAmount <= 0) return;
          const key = `${normalizeText(desc)}|${Math.round(absAmount * 100)}`;
          const existing = duplicateBuckets.get(key);
          if (existing) {
            existing.count += 1;
            existing.total += absAmount;
            if (t.dateObj > existing.lastDate) existing.lastDate = t.dateObj;
          } else {
            duplicateBuckets.set(key, {
              desc,
              amount: absAmount,
              count: 1,
              total: absAmount,
              lastDate: t.dateObj,
            });
          }
        });

      Array.from(duplicateBuckets.values())
        .filter((entry) => entry.count >= minCount && entry.total >= minTotal)
        .sort((a, b) => b.total - a.total)
        .slice(0, 2)
        .forEach((entry, idx) => {
          const severity = entry.total > minTotal * 2 || entry.count >= minCount + 1 ? 'warning' : 'info';
          const payload = {
            description: entry.desc,
            amount: entry.total,
            filterValue: entry.desc,
          };

          if (shouldExcludeAlert('duplicate_charge', payload)) return;

          alerts.push({
            ruleKey: 'duplicate_charge',
            dedupeKey: `dup-${idx}-${normalizeText(entry.desc)}-${currentStart.toISOString().slice(0, 10)}`,
            type: severity,
            title: 'Posible duplicado',
            message: `${entry.count} cargos similares de ${formatCurrency(entry.amount)} en ${windowDays} dias`,
            detail: `Total afectado: ${formatCurrency(entry.total)}`,
            eventAt: entry.lastDate.toISOString(),
            payload,
            priority: 60,
            impact: entry.total,
          });
        });
    }

    const uncategorizedRule = getRuleConfig('uncategorized');
    if (uncategorizedRule.isActive && dated.length > 0) {
      const windowDays = uncategorizedRule.config.window_days ?? 60;
      const minCount = uncategorizedRule.config.min_count ?? 5;
      const minTotal = uncategorizedRule.config.min_total ?? 200;
      const currentStart = windowStart(windowDays);
      const uncategorized = dated.filter(
        (t) => t.dateObj >= currentStart && normalizeText(t.category || '') === 'sin categoria'
      );

      if (uncategorized.length >= minCount) {
        const uncategorizedTotal = sumAbs(uncategorized);
        if (uncategorizedTotal >= minTotal) {
          const payload = {
            category: 'Sin Categoria',
            amount: uncategorizedTotal,
            filterValue: 'Sin Categoria',
          };

          if (!shouldExcludeAlert('uncategorized', payload)) {
            alerts.push({
              ruleKey: 'uncategorized',
              dedupeKey: `uncategorized-${currentStart.toISOString().slice(0, 10)}`,
              type: uncategorizedTotal >= minTotal * 2 ? 'warning' : 'info',
              title: 'Movimientos sin categoria',
              message: `${uncategorized.length} movimientos sin categoria`,
              detail: `Total: ${formatCurrency(uncategorizedTotal)}`,
              eventAt: currentStart.toISOString(),
              payload,
              priority: 45,
              impact: uncategorizedTotal,
            });
          }
        }
      }
    }

    const runwayRule = getRuleConfig('runway_low');
    if (runwayRule.isActive && averageMonthlyNet < 0 && transactions.length > 0) {
      const warningMonths = runwayRule.config.warning_months ?? 6;
      const dangerMonths = runwayRule.config.danger_months ?? 3;
      const burnRate = Math.abs(averageMonthlyNet);
      const monthsLeft = burnRate > 0 ? Math.max(0, currentBalance / burnRate) : 0;
      if (monthsLeft < warningMonths) {
        alerts.push({
          ruleKey: 'runway_low',
          dedupeKey: `runway-${now.toISOString().slice(0, 7)}`,
          type: monthsLeft <= dangerMonths ? 'danger' : 'warning',
          title: 'Runway bajo',
          message: `Caja para ${monthsLeft.toFixed(1)} meses al ritmo actual`,
          detail: `Burn rate: ${formatCurrency(burnRate)}/mes | Saldo: ${formatCurrency(currentBalance)}`,
          eventAt: now.toISOString(),
          payload: {
            amount: burnRate,
          },
          priority: 85,
          impact: burnRate,
        });
      }
    }

    return alerts;
  }, [transactions, getRuleConfig, shouldExcludeAlert, averageMonthlyNet, currentBalance]);

  const alertEventInputs = React.useMemo<AlertEventInput[]>(
    () =>
      alertCandidates.map((alert) => ({
        rule_key: alert.ruleKey,
        dedupe_key: alert.dedupeKey,
        severity: alert.type,
        title: alert.title,
        message: alert.message,
        detail: alert.detail ?? null,
        event_at: alert.eventAt,
        payload: alert.payload ?? {},
      })),
    [alertCandidates]
  );

  React.useEffect(() => {
    if (!accessToken || alertSettingsLoading) return;
    if (alertEventInputs.length === 0) {
      setAlertEvents([]);
      return;
    }

    syncAlertEvents(accessToken, alertEventInputs).catch((error) => {
      console.error('Error syncing alerts:', error);
    });
  }, [accessToken, alertEventInputs, alertSettingsLoading, syncAlertEvents]);

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
      warnings: alertCandidates.filter((a) => a.type !== 'info').map((a) => a.message),
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

  // Generate Notifications (Persisted Events)
  const notifications = React.useMemo<Notification[]>(() => {
    if (alertEvents.length === 0) {
      return [
        {
          id: 'empty',
          type: 'info',
          title: 'Sistema actualizado',
          message: 'Todo parece estar en orden. No hay alertas activas.',
          timestamp: 'ahora mismo',
        },
      ];
    }

    const severityRank = { danger: 3, warning: 2, info: 1 };

    return alertEvents
      .slice()
      .sort((a, b) => {
        const severityDiff = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
        if (severityDiff !== 0) return severityDiff;
        const dateA = safeParseDate(a.event_at) ?? safeParseDate(a.created_at) ?? new Date(0);
        const dateB = safeParseDate(b.event_at) ?? safeParseDate(b.created_at) ?? new Date(0);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, 6)
      .map((event) => {
        const eventDate = safeParseDate(event.event_at) ?? safeParseDate(event.created_at) ?? new Date();
        return {
          id: event.id,
          type: event.severity,
          title: event.title,
          message: event.message,
          detail: event.detail ?? undefined,
          timestamp: eventDate ? formatRelativeDays(eventDate) : 'reciente',
          actions: buildNotificationActions(event),
        };
      });
  }, [alertEvents, buildNotificationActions]);

  const alertCount = React.useMemo(
    () => alertEvents.filter((event) => event.severity === 'warning' || event.severity === 'danger').length,
    [alertEvents]
  );

  const handleFileIngest = async (file: File) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      const accessToken = session?.access_token;

      if (!uid) {
        throw new Error("Debes iniciar sesion para importar datos.");
      }

      if (isPdfFile(file)) {
        alert(`Formato no permitido. Formatos aceptados: ${acceptedFormatsLabel}`);
        return;
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

          alert(`Importacion exitosa. Se anadieron ${dataToInsert.length} movimientos.`);
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
                onClick={() => {
                  setIsNotificationsOpen(true);
                  setIsAlertSettingsOpen(false);
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20 hover:border-blue-400/60 transition-colors relative"
              >
                {alertCount > 0 && (
                  <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] leading-[18px] text-white text-center">
                    {alertCount}
                  </div>
                )}
                <Bell size={14} className="text-blue-200" />
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
                  progressValue={coveragePct}
                  subText={incomeSubText}
                />
                <KPICard
                  title="Gastos Totales"
                  value={new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(totalExpense)}
                  icon={<TrendingDown size={64} className="text-red-400" />}
                  progressColor="red"
                  progressValue={expensePct}
                  subText={expenseSubText}
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

              <div className="glass-panel p-6">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Table2 className="text-emerald-400" size={16} /> Resumen por categorias
                  </h3>
                  <div className="flex gap-1 bg-slate-800/50 p-1 rounded-full border border-white/5">
                    <button
                      onClick={() => setSummaryMode('expenses')}
                      className={`text-[10px] px-3 py-1 rounded-full transition-all ${summaryMode === 'expenses' ? 'bg-red-500/20 text-red-200 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      Gastos
                    </button>
                    <button
                      onClick={() => setSummaryMode('income')}
                      className={`text-[10px] px-3 py-1 rounded-full transition-all ${summaryMode === 'income' ? 'bg-emerald-500/20 text-emerald-200 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      Ingresos
                    </button>
                  </div>
                </div>
                {summaryMode === 'expenses' ? (
                  expenseSummary.length === 0 ? (
                    <p className="text-sm text-slate-500">Sin datos.</p>
                  ) : (
                    (() => {
                      const summaryRows = expenseSummary;
                      const totalCategories = summaryRows.reduce((acc, row) => acc + row.value, 0);
                      const visible = showAllCategories ? summaryRows : summaryRows.slice(0, 10);
                      const remaining = summaryRows.length - visible.length;

                      return (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 text-[11px] text-slate-500 uppercase tracking-wide px-1">
                            <span>Categoria</span>
                            <span className="text-right">Gastos</span>
                          </div>
                          <div className="max-h-[260px] overflow-y-auto pr-1 space-y-2">
                            {visible.map((row) => {
                              const percent = totalCategories > 0 ? Math.round((row.value / totalCategories) * 100) : 0;
                              return (
                                <div key={row.label} className="grid grid-cols-2 items-center text-sm text-slate-200 px-1">
                                  <span className="truncate flex items-center gap-2">
                                    <span className="truncate">{row.label}</span>
                                    <span className="text-[10px] text-slate-500">{percent}%</span>
                                  </span>
                                  <span className="text-right text-red-300">{formatCurrency(row.value)}</span>
                                </div>
                              );
                            })}
                          </div>
                          {remaining > 0 && (
                            <button
                              type="button"
                              onClick={() => setShowAllCategories(true)}
                              className="text-[11px] text-blue-300 hover:text-blue-200 transition-colors"
                            >
                              Ver mas (+{remaining})
                            </button>
                          )}
                          {showAllCategories && summaryRows.length > 10 && (
                            <button
                              type="button"
                              onClick={() => setShowAllCategories(false)}
                              className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
                            >
                              Ver menos
                            </button>
                          )}
                        </div>
                      );
                    })()
                  )
                ) : incomeSummary.length === 0 ? (
                  <p className="text-sm text-slate-500">Sin datos.</p>
                ) : (
                  (() => {
                    const summaryRows = incomeSummary;
                    const totalCategories = summaryRows.reduce((acc, row) => acc + row.value, 0);
                    const visible = showAllCategories ? summaryRows : summaryRows.slice(0, 10);
                    const remaining = summaryRows.length - visible.length;

                    return (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 text-[11px] text-slate-500 uppercase tracking-wide px-1">
                          <span>Categoria</span>
                          <span className="text-right">Ingresos</span>
                        </div>
                        <div className="max-h-[260px] overflow-y-auto pr-1 space-y-2">
                          {visible.map((row) => {
                            const percent = totalCategories > 0 ? Math.round((row.value / totalCategories) * 100) : 0;
                            return (
                              <div key={row.label} className="grid grid-cols-2 items-center text-sm text-slate-200 px-1">
                                <span className="truncate flex items-center gap-2">
                                  <span className="truncate">{row.label}</span>
                                  <span className="text-[10px] text-slate-500">{percent}%</span>
                                </span>
                                <span className="text-right text-emerald-300">{formatCurrency(row.value)}</span>
                              </div>
                            );
                          })}
                        </div>
                        {remaining > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowAllCategories(true)}
                            className="text-[11px] text-blue-300 hover:text-blue-200 transition-colors"
                          >
                            Ver mas (+{remaining})
                          </button>
                        )}
                        {showAllCategories && summaryRows.length > 10 && (
                          <button
                            type="button"
                            onClick={() => setShowAllCategories(false)}
                            className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
                          >
                            Ver menos
                          </button>
                        )}
                      </div>
                    );
                  })()
                )}
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
                  <input
                    type="text"
                    placeholder="Buscar concepto..."
                    value={transactionFilter}
                    onChange={(event) => setTransactionFilter(event.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <TransactionTable
                initialData={transactions}
                onTransactionUpdate={handleTransactionUpdate}
                filterValue={transactionFilter}
                onFilterChange={setTransactionFilter}
                showToolbar={false}
              />
            </div>
          )}
        </main>
      </div>

      <NotificationPanel
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        onOpenSettings={() => {
          setIsNotificationsOpen(false);
          setIsAlertSettingsOpen(true);
        }}
      />
      <AlertSettingsPanel
        isOpen={isAlertSettingsOpen}
        onClose={() => setIsAlertSettingsOpen(false)}
        rules={alertRules}
        exclusions={alertExclusions}
        onSaveRules={handleSaveAlertRules}
        onAddExclusion={handleAddAlertExclusion}
        onRemoveExclusion={handleRemoveAlertExclusion}
      />
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
