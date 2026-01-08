import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import type { Database } from '@/types/database.types';
import { normalizeDescription, extractMerchant, inferTxnType } from '@/lib/ingest/normalization';

export const runtime = 'nodejs';

type IncomingTransaction = {
  date?: string;
  amount?: number;
  type?: 'income' | 'expense';
  category?: string;
  description?: string;
  user_id?: string;
  channel?: string;
  is_anomaly?: boolean;
  file_source_id?: string | null;
};

type IncomingPayload = {
  jobId?: string;
  file_source_id?: string | null;
  user_id?: string;
  transactions?: IncomingTransaction[];
};

const CALLBACK_SECRET = process.env.N8N_CALLBACK_SECRET;

function timingSafeMatch(signature: string | null, rawBody: string): boolean {
  if (!signature || !CALLBACK_SECRET) return false;
  const computed = crypto.createHmac('sha256', CALLBACK_SECRET).update(rawBody).digest('hex');

  const providedBuf = Buffer.from(signature, 'utf8');
  const computedBuf = Buffer.from(computed, 'utf8');

  if (providedBuf.length !== computedBuf.length) return false;
  return crypto.timingSafeEqual(providedBuf, computedBuf);
}

function isUuid(value: string | undefined): value is string {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  let step = 'start';
  let jobId: string | undefined;
  let fileSourceId: string | null | undefined;

  try {
    const signature = request.headers.get('x-signature');
    const rawBody = await request.text();
    step = 'read_body';

    step = 'verify_signature';
    if (!timingSafeMatch(signature, rawBody)) {
      console.error('[pdf/callback] invalid signature', { jobId, file_source_id: fileSourceId, step });
      return NextResponse.json({ ok: false, error: 'invalid_signature', step }, { status: 401 });
    }
    step = 'signature_ok';

    let payload: IncomingPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid_json', step }, { status: 400 });
    }
    step = 'parse_json';

    jobId = typeof payload.jobId === 'string' ? payload.jobId.trim() : undefined;
    const baseUserId = typeof payload.user_id === 'string' ? payload.user_id.trim() : undefined;
    fileSourceId = typeof payload.file_source_id === 'string' ? payload.file_source_id.trim() : null;
    const transactions = payload.transactions;

    if (!jobId || !baseUserId || !fileSourceId || !Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json({ ok: false, error: 'invalid_payload', step }, { status: 400 });
    }

    if (!isUuid(baseUserId)) {
      return NextResponse.json({ ok: false, error: 'invalid_user_id', step }, { status: 400 });
    }

    step = 'init_supabase';
    const supabase = getSupabaseAdmin();

    step = 'check_existing';
    const { count: existingCount, error: existingError } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('file_source_id', fileSourceId)
      .eq('user_id', baseUserId)
      .limit(1);

    if (existingError) {
      throw existingError;
    }

    if (existingCount && existingCount > 0) {
      return NextResponse.json(
        { ok: true, jobId, inserted: 0, file_source_id: fileSourceId, alreadyProcessed: true },
        { status: 200 },
      );
    }

    const prepared: Database['public']['Tables']['transactions']['Insert'][] = [];
    for (const tx of transactions) {
      const userId = tx.user_id ?? baseUserId;
      if (!isUuid(userId)) {
        return NextResponse.json({ ok: false, error: 'invalid_user_id', step }, { status: 400 });
      }

      const amount = Number(tx.amount ?? 0);
      if (Number.isNaN(amount)) {
        return NextResponse.json({ ok: false, error: 'invalid_amount', step }, { status: 400 });
      }

      if (!tx.date) {
        return NextResponse.json({ ok: false, error: 'missing_date', step }, { status: 400 });
      }

      const type: 'income' | 'expense' = tx.type ?? (amount < 0 ? 'expense' : 'income');
      const descriptionRaw = String(tx.description ?? '').trim();
      const descriptionClean = descriptionRaw ? normalizeDescription(descriptionRaw) : null;
      const merchant = descriptionClean ? extractMerchant(descriptionClean) : { merchantRaw: null, merchantNormalized: null };
      const inferredTxnType = inferTxnType(descriptionClean ?? '', amount);
      prepared.push({
        date: tx.date,
        amount,
        type,
        category: tx.category || 'Sin Categoria',
        description: tx.description ?? '',
        description_raw: descriptionRaw || null,
        description_clean: descriptionClean,
        merchant_raw: merchant.merchantRaw,
        merchant_normalized: merchant.merchantNormalized,
        txn_type: inferredTxnType,
        bank_source: 'pdf',
        category_id: null,
        category_source: 'unknown',
        category_confidence: null,
        rule_id: null,
        user_id: userId,
        channel: tx.channel || 'Importado',
        is_anomaly: tx.is_anomaly ?? false,
        file_source_id: tx.file_source_id ?? fileSourceId,
      });
    }
    step = 'prepare_rows';

    step = 'db_insert';
    const { error } = await supabase.from('transactions').insert(prepared);
    if (error) {
      console.error('[pdf/callback] db_error', { jobId, file_source_id: fileSourceId, step, reason: error.message });
      return NextResponse.json({ ok: false, error: 'db_insert_failed', step, message: error.message }, { status: 500 });
    }

    console.log('[pdf/callback] inserted', { jobId, file_source_id: fileSourceId, count: prepared.length });
    return NextResponse.json({ ok: true, jobId, inserted: prepared.length, file_source_id: fileSourceId }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[pdf/callback] error', { jobId, file_source_id: fileSourceId, step, reason: msg });
    return NextResponse.json({ ok: false, step, message: msg }, { status: 500 });
  }
}
