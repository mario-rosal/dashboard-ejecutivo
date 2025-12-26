import { NextResponse } from 'next/server';

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
  if (summary) {
    lines.push('Resumen actual:');
    if (summary.currentBalance !== undefined) lines.push(`- Caja actual: ${summary.currentBalance}`);
    if (summary.totalIncome !== undefined) lines.push(`- Ingresos mes: ${summary.totalIncome}`);
    if (summary.totalExpense !== undefined) lines.push(`- Gastos mes: ${summary.totalExpense}`);
    if (summary.profit !== undefined) lines.push(`- Resultado mes: ${summary.profit}`);
    if (summary.margin !== undefined) lines.push(`- Margen: ${summary.margin}%`);
    if (summary.averageMonthlyNet !== undefined) lines.push(`- Net mensual medio: ${summary.averageMonthlyNet}`);
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
    '\nEres un CFO asistente. Genera un informe breve y accionable en 3-4 puntos: 1) Estado de caja y tendencia, 2) Riesgos especificos, 3) Oportunidades/ahorros concretos, 4) Siguiente accion priorizada. Se directo y especifico. Responde en espanol.'
  );

  return lines.join('\n');
}

export async function POST(request: Request) {
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
          generationConfig: { temperature: 0.35, maxOutputTokens: 400 },
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

    return NextResponse.json({ ok: true, insight: text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: 'request_failed', message: msg }, { status: 500 });
  }
}
