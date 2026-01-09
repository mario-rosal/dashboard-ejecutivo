import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

type InsightRequest = {
  summary?: {
    totalIncome?: number;
    totalExpense?: number;
    profit?: number;
    margin?: number;
    currentBalance?: number;
    averageMonthlyNet?: number;
  };
  monthlyAgg?: Array<{ month: string; income: number; expense: number }>;
  topIncomeCategories?: Array<{ label: string; value: number }>;
  topExpenseCategories?: Array<{ label: string; value: number }>;
  warnings?: string[];
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

function buildPrompt(payload: InsightRequest) {
  const { summary, monthlyAgg, topIncomeCategories, topExpenseCategories, warnings } = payload;

  const lines: string[] = [];
  const lastTwo = monthlyAgg && monthlyAgg.length >= 2 ? monthlyAgg.slice(-2) : null;
  const lastMonth = lastTwo ? lastTwo[1] : null;
  const prevMonth = lastTwo ? lastTwo[0] : null;
  const lastNet = lastMonth ? lastMonth.income - lastMonth.expense : null;
  const prevNet = prevMonth ? prevMonth.income - prevMonth.expense : null;
  const netDelta = lastNet !== null && prevNet !== null ? lastNet - prevNet : null;
  const incomeDelta = lastMonth && prevMonth ? lastMonth.income - prevMonth.income : null;
  const expenseDelta = lastMonth && prevMonth ? lastMonth.expense - prevMonth.expense : null;
  const incomeDeltaPct =
    incomeDelta !== null && prevMonth && prevMonth.income > 0
      ? (incomeDelta / prevMonth.income) * 100
      : null;
  const expenseDeltaPct =
    expenseDelta !== null && prevMonth && prevMonth.expense > 0
      ? (expenseDelta / prevMonth.expense) * 100
      : null;
  const topExpenseSum = topExpenseCategories
    ? topExpenseCategories.reduce((acc, curr) => acc + curr.value, 0)
    : null;
  const topIncomeSum = topIncomeCategories
    ? topIncomeCategories.reduce((acc, curr) => acc + curr.value, 0)
    : null;
  const expenseTopCoverage =
    summary?.totalExpense !== undefined && topExpenseSum !== null && summary.totalExpense > 0
      ? (topExpenseSum / summary.totalExpense) * 100
      : null;
  const incomeTopCoverage =
    summary?.totalIncome !== undefined && topIncomeSum !== null && summary.totalIncome > 0
      ? (topIncomeSum / summary.totalIncome) * 100
      : null;
  const runwayMonths =
    summary?.currentBalance !== undefined &&
    summary?.averageMonthlyNet !== undefined &&
    summary.currentBalance > 0 &&
    summary.averageMonthlyNet < 0
      ? summary.currentBalance / Math.abs(summary.averageMonthlyNet)
      : null;

  if (summary) {
    lines.push('Resumen actual:');
    if (summary.currentBalance !== undefined) lines.push(`- Caja actual: ${summary.currentBalance}`);
    if (summary.totalIncome !== undefined) lines.push(`- Ingresos mes: ${summary.totalIncome}`);
    if (summary.totalExpense !== undefined) lines.push(`- Gastos mes: ${summary.totalExpense}`);
    if (summary.profit !== undefined) lines.push(`- Resultado mes: ${summary.profit}`);
    if (summary.margin !== undefined) lines.push(`- Margen: ${summary.margin}%`);
    if (summary.averageMonthlyNet !== undefined) lines.push(`- Net mensual medio: ${summary.averageMonthlyNet}`);
  }

  if (lastMonth && prevMonth) {
    lines.push('\nVariaciones recientes:');
    lines.push(`- Mes actual: ${lastMonth.month} | neto ${lastNet}`);
    lines.push(`- Mes previo: ${prevMonth.month} | neto ${prevNet}`);
    if (netDelta !== null) lines.push(`- Cambio de neto: ${netDelta}`);
    if (incomeDelta !== null) lines.push(`- Variacion ingresos: ${incomeDelta}`);
    if (incomeDeltaPct !== null) lines.push(`- Variacion ingresos %: ${incomeDeltaPct.toFixed(1)}`);
    if (expenseDelta !== null) lines.push(`- Variacion gastos: ${expenseDelta}`);
    if (expenseDeltaPct !== null) lines.push(`- Variacion gastos %: ${expenseDeltaPct.toFixed(1)}`);
  }

  if (expenseTopCoverage !== null) {
    lines.push(`\nConcentracion gastos (top 5): al menos ${expenseTopCoverage.toFixed(1)}% del total`);
  }
  if (incomeTopCoverage !== null) {
    lines.push(`\nConcentracion ingresos (top 5): al menos ${incomeTopCoverage.toFixed(1)}% del total`);
  }
  if (runwayMonths !== null) {
    lines.push(`\nRunway estimado (meses): ${runwayMonths.toFixed(1)}`);
  }

  if (monthlyAgg && monthlyAgg.length) {
    lines.push('\nEvolucion mensual (ingresos/gastos):');
    monthlyAgg.slice(-6).forEach((m) => {
      lines.push(`- ${m.month}: +${m.income} / -${m.expense}`);
    });
  }

  if (topExpenseCategories && topExpenseCategories.length) {
    lines.push('\nTop gastos (categorias):');
    topExpenseCategories.slice(0, 5).forEach((c) => lines.push(`- ${c.label}: ${c.value}`));
  }

  if (topIncomeCategories && topIncomeCategories.length) {
    lines.push('\nTop ingresos (categorias):');
    topIncomeCategories.slice(0, 5).forEach((c) => lines.push(`- ${c.label}: ${c.value}`));
  }

  if (warnings && warnings.length) {
    lines.push('\nAlertas detectadas:');
    warnings.slice(0, 5).forEach((w) => lines.push(`- ${w}`));
  }

  lines.push(
    '\nEres un CFO asistente. Usa SOLO los datos listados arriba; no inventes cifras, tendencias ni causas. ' +
      'Si falta informacion, indica "Datos insuficientes". ' +
      'No repitas los valores obvios; entrega insights de valor para un empresario. ' +
      'Entrega 3-4 bullets con este formato: "Hallazgo -> Implicacion -> Accion". ' +
      'Incluye al menos: 1) caja/tendencia con dato, 2) riesgo concreto, 3) oportunidad/ahorro con foco en categorias, 4) siguiente accion priorizada. ' +
      'Responde en espanol.'
  );

  return lines.join('\n');
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (allCookies) => {
          try {
            allCookies.forEach(({ name, value, options }) => {
              cookieStore.set({ name, value, ...options });
            });
          } catch {
            // ignore cookie set failures
          }
        },
      },
    }
  );

  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!GEMINI_API_KEY) {
    return NextResponse.json({ ok: false, error: 'GEMINI_API_KEY missing' }, { status: 500 });
  }

  let payload: InsightRequest;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const prompt = buildPrompt(payload);

  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
        }),
      }
    );

    if (!res.ok) {
      const detail = await res.text();
      console.error('[ai/insights] llm_error', { status: res.status, detail });
      return NextResponse.json({ ok: false, error: 'llm_error', status: res.status, detail }, { status: 502 });
    }

    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text)
        .filter(Boolean)
        .join('\n')
        ?.trim() || null;

    if (!text) {
      return NextResponse.json({ ok: false, error: 'empty_response' }, { status: 502 });
    }

    const usage = data?.usageMetadata as {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    } | undefined;

    try {
      const supabase = getSupabaseAdmin();
      const { error: usageError } = await supabase.from('ai_usage').insert({
        user_id: user.id,
        feature: 'insights',
        model: 'gemini-2.0-flash',
        prompt_tokens: usage?.promptTokenCount ?? null,
        completion_tokens: usage?.candidatesTokenCount ?? null,
        total_tokens: usage?.totalTokenCount ?? null,
        request_id: data?.responseId ?? null,
        metadata: usage ?? null,
      });

      if (usageError) {
        console.error('[ai/insights] usage insert failed', usageError);
      }
    } catch (usageErr) {
      console.error('[ai/insights] usage insert crashed', usageErr);
    }

    return NextResponse.json({ ok: true, insight: text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: 'request_failed', message: msg }, { status: 500 });
  }
}
