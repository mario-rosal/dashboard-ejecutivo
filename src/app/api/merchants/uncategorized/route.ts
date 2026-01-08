import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
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
  const limitParam = Number(url.searchParams.get('limit') ?? 50);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('get_uncategorized_merchants', {
    p_user_id: user.id,
    p_limit: limit,
  });

  if (error) {
    console.error('[merchants/uncategorized] rpc failed', error);
    return NextResponse.json({ error: 'rpc_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, merchants: data ?? [] });
}
