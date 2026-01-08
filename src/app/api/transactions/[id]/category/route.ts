import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import * as engine from '@/lib/categorization/engine';

export const runtime = 'nodejs';

type Payload = {
  category_id?: string;
  apply_to_merchant?: boolean;
  scope?: 'user' | 'account';
};

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
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

  let payload: Payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const categoryId = payload.category_id?.trim();
  if (!categoryId) {
    return NextResponse.json({ error: 'category_id requerido' }, { status: 400 });
  }

  const transactionId = params.id;
  if (!transactionId) {
    return NextResponse.json({ error: 'transaction_id requerido' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .select('id,user_id,account_id,merchant_normalized,category_id,category')
    .eq('id', transactionId)
    .eq('user_id', user.id)
    .single();

  if (txError || !transaction) {
    return NextResponse.json({ error: 'transaction_not_found' }, { status: 404 });
  }

  const { data: category, error: categoryError } = await supabase
    .from('categories')
    .select('id,name')
    .eq('id', categoryId)
    .single();

  if (categoryError || !category) {
    return NextResponse.json({ error: 'category_not_found' }, { status: 404 });
  }

  const applyToMerchant = payload.apply_to_merchant === true;
  const scope = payload.scope || 'user';
  if (applyToMerchant && scope === 'account' && !transaction.account_id) {
    return NextResponse.json({ error: 'account_id requerido para scope=account' }, { status: 400 });
  }

  let manualUpdate;
  try {
    manualUpdate = engine.buildManualUpdate({
      transaction,
      category,
      applyToMerchant,
      scope,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid_override';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!manualUpdate) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const { update, audit, override } = manualUpdate;

  const { error: updateError } = await supabase
    .from('transactions')
    .update(update)
    .eq('id', transactionId)
    .eq('user_id', user.id);

  if (updateError) {
    return NextResponse.json({ error: 'update_failed', message: updateError.message }, { status: 500 });
  }

  if (override) {
    const { error: overrideError } = await supabase
      .from('merchant_category_overrides')
      .upsert(override, { onConflict: 'user_id,scope,account_id,merchant_normalized' });

    if (overrideError) {
      return NextResponse.json({ error: 'override_failed', message: overrideError.message }, { status: 500 });
    }
  }

  if (audit) {
    const { error: auditError } = await supabase.from('category_audit').insert(audit);
    if (auditError) {
      console.error('[transactions/category] audit insert failed', auditError);
    }
  }

  return NextResponse.json({
    ok: true,
    transaction_id: transactionId,
    category_id: categoryId,
    apply_to_merchant: applyToMerchant,
    scope,
  });
}
