import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ALERT_RULE_DEFINITIONS, ALERT_RULE_DEFAULTS } from '@/lib/alerts/definitions';

export const runtime = 'nodejs';

const allowedRuleKeys = new Set<string>(ALERT_RULE_DEFINITIONS.map((rule) => rule.key));

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
    .from('alert_rules')
    .select('id,user_id,rule_key,is_active,config,created_at,updated_at')
    .eq('user_id', user.id)
    .order('rule_key', { ascending: true });

  if (error) {
    console.error('[alerts/rules] fetch failed', error);
    return NextResponse.json({ error: 'rules_fetch_failed' }, { status: 500 });
  }

  const existing = data ?? [];
  const existingKeys = new Set(existing.map((rule) => rule.rule_key));
  const missingDefaults = ALERT_RULE_DEFAULTS.filter((rule) => !existingKeys.has(rule.rule_key));

  if (missingDefaults.length === 0) {
    return NextResponse.json({ ok: true, rules: existing });
  }

  const now = new Date().toISOString();
  const defaults = missingDefaults.map((rule) => ({
    user_id: user.id,
    rule_key: rule.rule_key,
    is_active: rule.is_active,
    config: rule.config ?? {},
    created_at: now,
    updated_at: now,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from('alert_rules')
    .insert(defaults)
    .select('id,user_id,rule_key,is_active,config,created_at,updated_at');

  if (insertError) {
    console.error('[alerts/rules] insert defaults failed', insertError);
    return NextResponse.json({ error: 'rules_insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rules: [...existing, ...(inserted ?? [])] });
}

export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const rules = Array.isArray(body?.rules) ? body.rules : null;
  if (!rules) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const payload = rules
    .filter((rule: { rule_key?: string }) => rule?.rule_key && allowedRuleKeys.has(rule.rule_key))
    .map((rule: { rule_key: string; is_active?: boolean; config?: Record<string, unknown> }) => ({
      user_id: user.id,
      rule_key: rule.rule_key,
      is_active: typeof rule.is_active === 'boolean' ? rule.is_active : true,
      config: rule.config && typeof rule.config === 'object' ? rule.config : {},
      updated_at: now,
    }));

  if (payload.length === 0) {
    return NextResponse.json({ error: 'no_valid_rules' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('alert_rules')
    .upsert(payload, { onConflict: 'user_id,rule_key' })
    .select('id,user_id,rule_key,is_active,config,created_at,updated_at');

  if (error) {
    console.error('[alerts/rules] upsert failed', error);
    return NextResponse.json({ error: 'rules_update_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rules: data ?? [] });
}
