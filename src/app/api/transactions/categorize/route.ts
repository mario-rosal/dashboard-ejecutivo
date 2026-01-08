import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import * as engine from '@/lib/categorization/engine';
import { normalizeDescription, extractMerchant, inferTxnType } from '@/lib/ingest/normalization';

export const runtime = 'nodejs';

const PAGE_SIZE = 1000;
const CHUNK_SIZE = 500;

type CategorizationTransaction = Pick<
  Database['public']['Tables']['transactions']['Row'],
  | 'id'
  | 'user_id'
  | 'account_id'
  | 'date'
  | 'amount'
  | 'type'
  | 'txn_type'
  | 'description'
  | 'description_raw'
  | 'description_clean'
  | 'merchant_raw'
  | 'merchant_normalized'
  | 'category_id'
  | 'category_source'
  | 'category_confidence'
  | 'rule_id'
  | 'category'
>;

async function fetchTransactions(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string) {
  const rows: CategorizationTransaction[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('transactions')
      .select(
        'id,user_id,account_id,date,amount,type,txn_type,description,description_raw,description_clean,merchant_raw,merchant_normalized,category_id,category_source,category_confidence,rule_id,category'
      )
      .eq('user_id', userId)
      .range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function fetchOverrides(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  merchantKeys: string[]
) {
  const overrides: Database['public']['Tables']['merchant_category_overrides']['Row'][] = [];
  for (let i = 0; i < merchantKeys.length; i += CHUNK_SIZE) {
    const chunk = merchantKeys.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase
      .from('merchant_category_overrides')
      .select('id,user_id,merchant_normalized,category_id,scope,account_id,is_active,created_at,updated_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .in('merchant_normalized', chunk);
    if (error) throw error;
    if (data) overrides.push(...data);
  }
  return overrides;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7)
    : undefined;

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
      global: accessToken
        ? {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        : undefined,
    }
  );

  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === 'true';

  const supabase = getSupabaseAdmin();
  const transactions = await fetchTransactions(supabase, user.id);

  if (transactions.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, skipped: 0, total: 0 });
  }

  const now = new Date().toISOString();
  const updatesMap = new Map<string, Database['public']['Tables']['transactions']['Insert']>();
  const canonicalUpdated = new Set<string>();
  const normalizedTransactions: CategorizationTransaction[] = [];
  const transactionById = new Map<string, CategorizationTransaction>();

  for (const tx of transactions) {
    transactionById.set(tx.id, tx);
    const descriptionRaw = String(tx.description_raw ?? tx.description ?? '').trim();
    const descriptionClean = descriptionRaw ? normalizeDescription(descriptionRaw) : null;
    const extracted = descriptionClean ? extractMerchant(descriptionClean) : { merchantRaw: null, merchantNormalized: null };

    const merchantRaw = tx.merchant_raw ?? extracted.merchantRaw;
    const merchantNormalized = tx.merchant_normalized ?? extracted.merchantNormalized;

    let txnType = tx.txn_type ?? null;
    if (!txnType || txnType === 'unknown') {
      const inferred = inferTxnType(descriptionClean ?? '', tx.amount ?? 0);
      if (inferred && inferred !== txnType) {
        txnType = inferred;
      }
    }

    const update: Database['public']['Tables']['transactions']['Insert'] = {
      id: tx.id,
      date: tx.date,
      amount: tx.amount,
      type: tx.type,
      category: tx.category ?? 'Sin Categoria',
    };

    let touched = false;
    if (!tx.description_raw && descriptionRaw) {
      update.description_raw = descriptionRaw;
      touched = true;
    }
    if (!tx.description_clean && descriptionClean) {
      update.description_clean = descriptionClean;
      touched = true;
    }
    if (!tx.merchant_raw && merchantRaw) {
      update.merchant_raw = merchantRaw;
      touched = true;
    }
    if (!tx.merchant_normalized && merchantNormalized) {
      update.merchant_normalized = merchantNormalized;
      touched = true;
    }
    if ((!tx.txn_type || tx.txn_type === 'unknown') && txnType && txnType !== tx.txn_type) {
      update.txn_type = txnType;
      touched = true;
    }

    if (touched) {
      update.updated_at = now;
      updatesMap.set(tx.id, update);
      canonicalUpdated.add(tx.id);
    }

    normalizedTransactions.push({
      ...tx,
      description_raw: descriptionRaw || tx.description_raw,
      description_clean: descriptionClean ?? tx.description_clean,
      merchant_raw: merchantRaw ?? tx.merchant_raw,
      merchant_normalized: merchantNormalized ?? tx.merchant_normalized,
      txn_type: txnType ?? tx.txn_type,
    });
  }

  const merchantKeys = Array.from(
    new Set(
      normalizedTransactions
        .map((tx) => tx.merchant_normalized)
        .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    )
  );
  const overrides = merchantKeys.length
    ? await fetchOverrides(supabase, user.id, merchantKeys)
    : [];

  const { data: rules, error: rulesError } = await supabase
    .from('category_rules')
    .select(
      'id,user_id,priority,is_active,match_field,match_type,pattern,txn_type_filter,min_amount,max_amount,category_id,confidence,created_at'
    )
    .eq('is_active', true)
    .or(`user_id.eq.${user.id},user_id.is.null`);

  if (rulesError) {
    console.error('[categorize-all] rules fetch failed', rulesError);
    return NextResponse.json({ error: 'rules_fetch_failed' }, { status: 500 });
  }

  const { data: categories, error: categoriesError } = await supabase
    .from('categories')
    .select('id,name');

  if (categoriesError) {
    console.error('[categorize-all] categories fetch failed', categoriesError);
    return NextResponse.json({ error: 'categories_fetch_failed' }, { status: 500 });
  }

  const categoriesById = (categories || []).reduce<Record<string, string>>((acc, row) => {
    acc[row.id] = row.name;
    return acc;
  }, {});

  const { updates, audits, skipped } = engine.buildBatchUpdates({
    transactions: normalizedTransactions,
    overrides,
    rules: rules || [],
    categoriesById,
    force,
  });

  for (const update of updates) {
    if (!update?.id) continue;
    const existing = updatesMap.get(update.id);
    updatesMap.set(update.id, existing ? { ...existing, ...update } : update);
  }

  const finalUpdates = Array.from(updatesMap.values())
    .map((update) => {
      if (!update?.id) return update;
      const base = transactionById.get(update.id);
      if (!base) return update;
      return {
        user_id: update.user_id ?? base.user_id ?? undefined,
        account_id: update.account_id ?? base.account_id ?? undefined,
        date: update.date ?? base.date,
        amount: update.amount ?? base.amount,
        type: update.type ?? base.type,
        category: update.category ?? base.category ?? 'Sin Categoria',
        ...update,
      };
    })
    .filter((update) => update && update.id && update.user_id);
  if (finalUpdates.length > 0) {
    const { error } = await supabase.from('transactions').upsert(finalUpdates, { onConflict: 'id' });
    if (error) {
      console.error('[categorize-all] update failed', error);
      return NextResponse.json({ error: 'update_failed', message: error.message }, { status: 500 });
    }
  }

  if (audits.length > 0) {
    const { error } = await supabase.from('category_audit').insert(audits);
    if (error) {
      console.error('[categorize-all] audit insert failed', error);
    }
  }

  console.log('[categorize-all] summary', {
    total: transactions.length,
    updated: finalUpdates.length,
    canonical_updated: canonicalUpdated.size,
    category_updates: updates.length,
    skipped,
    force,
  });

  return NextResponse.json({
    ok: true,
    total: transactions.length,
    updated: finalUpdates.length,
    canonical_updated: canonicalUpdated.size,
    category_updates: updates.length,
    skipped,
  });
}
