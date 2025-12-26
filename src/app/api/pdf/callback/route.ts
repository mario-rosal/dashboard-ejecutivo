import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Missing Supabase service configuration' }, { status: 500 });
  }

  const signature = request.headers.get('x-signature');
  console.log('[pdf/callback] hit', {
    hasSig: Boolean(request.headers.get('x-signature')),
    contentType: request.headers.get('content-type'),
    hasBody: true,
  });
  const rawBody = await request.text();

  if (!timingSafeMatch(signature, rawBody)) {
    return new Response('Unauthorized', { status: 401 });
  }
  console.log('[pdf/callback] authorized');

  let payload: IncomingPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const transactions = payload.transactions;
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return NextResponse.json({ error: 'No transactions provided' }, { status: 400 });
  }

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const prepared = [];
  for (const tx of transactions) {
    const userId = tx.user_id ?? payload.user_id;
    if (!isUuid(userId)) {
      return NextResponse.json({ error: 'Invalid or missing user_id' }, { status: 400 });
    }

    const amount = Number(tx.amount ?? 0);
    if (Number.isNaN(amount)) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    if (!tx.date) {
      return NextResponse.json({ error: 'Missing date' }, { status: 400 });
    }

    const type: 'income' | 'expense' = tx.type ?? (amount < 0 ? 'expense' : 'income');
    prepared.push({
      date: tx.date,
      amount,
      type,
      category: tx.category || 'Sin Categoría',
      description: tx.description ?? '',
      user_id: userId,
      channel: tx.channel || 'Importado',
      is_anomaly: tx.is_anomaly ?? false,
      file_source_id: tx.file_source_id ?? payload.file_source_id ?? null,
    } satisfies Database['public']['Tables']['transactions']['Insert']);
  }

  console.log('[pdf/callback] inserting', { count: prepared.length });
  const { error } = await supabase.from('transactions').insert(prepared);
  if (error) {
    console.log('[pdf/callback] db_error', { message: error.message });
    return NextResponse.json({ error: 'DB insert failed', details: error.message }, { status: 400 });
  }

  console.log('[pdf/callback] inserted', { count: prepared.length });
  return NextResponse.json({ ok: true, inserted: prepared.length });
}
