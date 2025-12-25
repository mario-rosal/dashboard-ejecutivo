import { NextResponse as NextResp } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';
import { NextResponse } from 'next/server';

const N8N_INGEST_URL = 'https://n8n.mytaskpanel.com/webhook/pdf/ingest';

export const runtime = 'nodejs'; // ensure Node APIs (crypto, FormData) are available

function buildCallbackUrl(request: Request) {
  const envBase = process.env.APP_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (envBase) return new URL('/api/n8n/callback', envBase).toString();

  const host = request.headers.get('host');
  if (!host) throw new Error('Missing host header');

  const proto = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '') || 'https';
  return `${proto}://${host}/api/n8n/callback`;
}

function ensurePdf(file: File) {
  const typeOk = file.type === 'application/pdf';
  const nameOk = file.name?.toLowerCase().endsWith('.pdf');
  if (!typeOk && !nameOk) {
    throw new Error('Solo se permiten archivos PDF');
  }
}

export async function POST(request: Request) {
  const bearer = process.env.N8N_INGEST_BEARER;
  if (!bearer) {
    return NextResp.json({ error: 'Falta N8N_INGEST_BEARER' }, { status: 500 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(
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
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const form = await request.formData();
  const file = form.get('pdf');
  if (!(file instanceof File)) {
    return NextResp.json({ error: 'Campo pdf requerido' }, { status: 400 });
  }

  try {
    ensurePdf(file);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Archivo invalido';
    return NextResp.json({ error: message }, { status: 400 });
  }

  let callbackUrl: string;
  try {
    callbackUrl = buildCallbackUrl(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo construir callbackUrl';
    return NextResp.json({ error: message }, { status: 500 });
  }

  const outbound = new FormData();
  outbound.append('pdf', file);
  outbound.append('callbackUrl', callbackUrl);
  outbound.append('clientRequestId', crypto.randomUUID());
  outbound.append('user_id', user.id);
  outbound.append('source', 'pdf');

  const res = await fetch(N8N_INGEST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
    },
    body: outbound,
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    return NextResp.json(
      { error: 'n8n error', status: res.status, body },
      { status: res.status || 502 }
    );
  }

  return NextResp.json(body);
}
