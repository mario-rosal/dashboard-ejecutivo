import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

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

export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const events = Array.isArray(body?.events) ? (body.events as AlertEventInput[]) : [];

  if (events.length === 0) {
    return NextResponse.json({ ok: true, events: [] });
  }

  const now = new Date().toISOString();
  const ruleKeys = Array.from(new Set(events.map((event) => event.rule_key)));
  const dedupeKeys = Array.from(new Set(events.map((event) => event.dedupe_key)));

  const supabase = getSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from('alert_events')
    .select('id,rule_key,dedupe_key,status,event_at')
    .eq('user_id', user.id)
    .in('rule_key', ruleKeys)
    .in('dedupe_key', dedupeKeys);

  if (existingError) {
    console.error('[alerts/sync] fetch existing failed', existingError);
    return NextResponse.json({ error: 'events_fetch_failed' }, { status: 500 });
  }

  const existingMap = new Map<string, (typeof existing)[number]>();
  (existing ?? []).forEach((row) => {
    existingMap.set(`${row.rule_key}:${row.dedupe_key}`, row);
  });

  const inserts: Database['public']['Tables']['alert_events']['Insert'][] = [];
  const updates: Array<Database['public']['Tables']['alert_events']['Update'] & { id: string }> = [];

  for (const event of events) {
    if (!event.rule_key || !event.dedupe_key) continue;
    const key = `${event.rule_key}:${event.dedupe_key}`;
    const existingRow = existingMap.get(key);

    if (!existingRow) {
      inserts.push({
        user_id: user.id,
        rule_key: event.rule_key,
        dedupe_key: event.dedupe_key,
        severity: event.severity,
        title: event.title,
        message: event.message,
        detail: event.detail ?? null,
        status: 'open',
        event_at: event.event_at ?? now,
        last_seen_at: now,
        payload: event.payload ?? {},
        created_at: now,
        updated_at: now,
      });
      continue;
    }

    const update: Database['public']['Tables']['alert_events']['Update'] & { id: string } = {
      id: existingRow.id,
      last_seen_at: now,
      updated_at: now,
    };

    if (existingRow.status === 'open') {
      update.severity = event.severity;
      update.title = event.title;
      update.message = event.message;
      update.detail = event.detail ?? null;
      update.payload = event.payload ?? {};
      if (event.event_at) {
        update.event_at = event.event_at;
      }
    }

    updates.push(update);
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from('alert_events').insert(inserts);
    if (error) {
      console.error('[alerts/sync] insert failed', error);
      return NextResponse.json({ error: 'events_insert_failed' }, { status: 500 });
    }
  }

  for (const update of updates) {
    const { id, ...payload } = update;
    const { error } = await supabase
      .from('alert_events')
      .update(payload)
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) {
      console.error('[alerts/sync] update failed', error);
      return NextResponse.json({ error: 'events_update_failed' }, { status: 500 });
    }
  }

  const { data: openEvents, error: openError } = await supabase
    .from('alert_events')
    .select(
      'id,user_id,rule_key,dedupe_key,severity,title,message,detail,status,event_at,last_seen_at,payload,created_at,updated_at'
    )
    .eq('user_id', user.id)
    .eq('status', 'open')
    .order('event_at', { ascending: false })
    .limit(50);

  if (openError) {
    console.error('[alerts/sync] fetch open failed', openError);
    return NextResponse.json({ error: 'events_open_fetch_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, events: openEvents ?? [] });
}
