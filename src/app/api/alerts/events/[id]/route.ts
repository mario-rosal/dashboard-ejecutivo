import { NextResponse, type NextRequest } from 'next/server';
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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getUser(request);
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id: eventId } = await context.params;
  if (!eventId) {
    return NextResponse.json({ error: 'missing_id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const status = String(body?.status ?? '').trim();
  if (!status || !['open', 'ignored', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('alert_events')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('user_id', user.id)
    .select(
      'id,user_id,rule_key,dedupe_key,severity,title,message,detail,status,event_at,last_seen_at,payload,created_at,updated_at'
    )
    .single();

  if (error) {
    console.error('[alerts/events] status update failed', error);
    return NextResponse.json({ error: 'event_update_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, event: data });
}
