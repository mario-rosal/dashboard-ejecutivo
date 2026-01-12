import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ALERT_RULE_DEFINITIONS } from '@/lib/alerts/definitions';

export const runtime = 'nodejs';

const allowedRuleKeys = new Set(ALERT_RULE_DEFINITIONS.map((rule) => rule.key));
const allowedMatchTypes = new Set(['merchant', 'category', 'description']);

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

async function getUser(request: Request) {
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

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  return user ?? null;
}

export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('alert_exclusions')
    .select(
      'id,user_id,rule_key,match_type,match_value,match_value_normalized,min_amount,max_amount,is_active,created_at,updated_at'
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[alerts/exclusions] fetch failed', error);
    return NextResponse.json({ error: 'exclusions_fetch_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, exclusions: data ?? [] });
}

export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const matchType = String(body?.match_type ?? '').trim();
  const matchValue = String(body?.match_value ?? '').trim();
  const ruleKey = body?.rule_key ? String(body.rule_key) : null;
  const minAmount = body?.min_amount ?? null;
  const maxAmount = body?.max_amount ?? null;

  if (!matchType || !matchValue) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  if (!allowedMatchTypes.has(matchType)) {
    return NextResponse.json({ error: 'invalid_match_type' }, { status: 400 });
  }

  if (ruleKey && !allowedRuleKeys.has(ruleKey)) {
    return NextResponse.json({ error: 'invalid_rule_key' }, { status: 400 });
  }

  const normalized = normalizeText(matchValue);
  const now = new Date().toISOString();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('alert_exclusions')
    .insert({
      user_id: user.id,
      rule_key: ruleKey,
      match_type: matchType,
      match_value: matchValue,
      match_value_normalized: normalized,
      min_amount: Number.isFinite(Number(minAmount)) ? Number(minAmount) : null,
      max_amount: Number.isFinite(Number(maxAmount)) ? Number(maxAmount) : null,
      is_active: true,
      created_at: now,
      updated_at: now,
    })
    .select(
      'id,user_id,rule_key,match_type,match_value,match_value_normalized,min_amount,max_amount,is_active,created_at,updated_at'
    )
    .single();

  if (error) {
    console.error('[alerts/exclusions] insert failed', error);
    return NextResponse.json({ error: 'exclusion_insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, exclusion: data });
}
