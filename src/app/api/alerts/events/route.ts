import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

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

  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status');
  const status =
    statusParam && ['open', 'ignored', 'dismissed'].includes(statusParam) ? statusParam : 'open';
  const limitParam = Number(url.searchParams.get('limit') ?? 50);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('alert_events')
    .select(
      'id,user_id,rule_key,dedupe_key,severity,title,message,detail,status,event_at,last_seen_at,payload,created_at,updated_at'
    )
    .eq('user_id', user.id)
    .eq('status', status)
    .order('event_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[alerts/events] fetch failed', error);
    return NextResponse.json({ error: 'events_fetch_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, events: data ?? [] });
}
