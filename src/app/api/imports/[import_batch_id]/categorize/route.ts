import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import * as engine from '@/lib/categorization/engine';

export const runtime = 'nodejs';

const PAGE_SIZE = 1000;
const CHUNK_SIZE = 500;

type CategorizationTransaction = Pick<
  Database['public']['Tables']['transactions']['Row'],
  | 'id'
  | 'user_id'
  | 'account_id'
  | 'amount'
  | 'txn_type'
  | 'description_clean'
  | 'merchant_normalized'
  | 'category_id'
  | 'category_source'
  | 'category_confidence'
  | 'rule_id'
  | 'category'
>;

async function fetchTransactions(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  importBatchId: string,
  userId: string
) {
  const rows: CategorizationTransaction[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('transactions')
      .select(
        'id,user_id,account_id,amount,txn_type,description_clean,merchant_normalized,category_id,category_source,category_confidence,rule_id,category'
      )
      .eq('import_batch_id', importBatchId)
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ import_batch_id: string }> }
) {
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

  const { import_batch_id: importBatchId } = await params;
  if (!importBatchId) {
    return NextResponse.json({ error: 'import_batch_id requerido' }, { status: 400 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === 'true';

  const supabase = getSupabaseAdmin();
  const transactions = await fetchTransactions(supabase, importBatchId, user.id);

  if (transactions.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, skipped: 0, total: 0 });
  }

  const merchantKeys = Array.from(
    new Set(transactions.map((tx) => tx.merchant_normalized).filter(Boolean))
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
    console.error('[categorize-batch] rules fetch failed', rulesError);
    return NextResponse.json({ error: 'rules_fetch_failed' }, { status: 500 });
  }

  const { data: categories, error: categoriesError } = await supabase
    .from('categories')
    .select('id,name');

  if (categoriesError) {
    console.error('[categorize-batch] categories fetch failed', categoriesError);
    return NextResponse.json({ error: 'categories_fetch_failed' }, { status: 500 });
  }

  const categoriesById = (categories || []).reduce<Record<string, string>>((acc, row) => {
    acc[row.id] = row.name;
    return acc;
  }, {});

  const { updates, audits, skipped } = engine.buildBatchUpdates({
    transactions,
    overrides,
    rules: rules || [],
    categoriesById,
    force,
  });

  if (updates.length > 0) {
    const { error } = await supabase.from('transactions').upsert(updates, { onConflict: 'id' });
    if (error) {
      console.error('[categorize-batch] update failed', error);
      return NextResponse.json({ error: 'update_failed', message: error.message }, { status: 500 });
    }
  }

  if (audits.length > 0) {
    const { error } = await supabase.from('category_audit').insert(audits);
    if (error) {
      console.error('[categorize-batch] audit insert failed', error);
    }
  }

  console.log('[categorize-batch] summary', {
    import_batch_id: importBatchId,
    total: transactions.length,
    updated: updates.length,
    skipped,
    force,
  });

  return NextResponse.json({
    ok: true,
    total: transactions.length,
    updated: updates.length,
    skipped,
  });
}
