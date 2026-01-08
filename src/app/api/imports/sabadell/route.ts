import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import * as sabadellParser from '@/lib/ingest/sabadellParser';
import * as sabadellImport from '@/lib/ingest/sabadellImport';

export const runtime = 'nodejs';

const CHUNK_SIZE = 500;

async function fetchExistingHashes(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  accountId: string,
  hashes: string[],
) {
  const existing: string[] = [];
  for (let i = 0; i < hashes.length; i += CHUNK_SIZE) {
    const chunk = hashes.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase
      .from('transactions')
      .select('external_hash')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .in('external_hash', chunk);

    if (error) throw error;
    for (const row of data ?? []) {
      if (row.external_hash) existing.push(row.external_hash);
    }
  }
  return existing;
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

  const form = await request.formData();
  const file = (form.get('file') || form.get('excel')) as File | null;
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Campo file requerido' }, { status: 400 });
  }

  const accountId = String(form.get('account_id') || form.get('account') || '').trim();
  if (!accountId) {
    return NextResponse.json({ error: 'Campo account_id requerido' }, { status: 400 });
  }

  const bankSource = String(form.get('bank_source') || 'sabadell').trim();
  const arrayBuffer = await file.arrayBuffer();
  const fileHash = crypto.createHash('sha256').update(Buffer.from(arrayBuffer)).digest('hex');

  let parsedRows: ReturnType<typeof sabadellParser.parseSabadellBuffer>;
  try {
    parsedRows = sabadellParser.parseSabadellBuffer(arrayBuffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Archivo invalido';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      user_id: user.id,
      bank_source: bankSource,
      file_name: file.name || 'upload',
      file_hash: fileHash,
      rows_total: parsedRows.length,
      rows_inserted: 0,
      rows_skipped: 0,
    })
    .select('id')
    .single();

  if (batchError || !batch) {
    console.error('[imports/sabadell] import batch create failed', batchError);
    return NextResponse.json({ error: 'batch_create_failed' }, { status: 500 });
  }

  const { transactions: canonical, skipped: invalidSkipped } = sabadellImport.buildCanonicalTransactions(
    parsedRows,
    {
      userId: user.id,
      accountId,
      bankSource,
      importBatchId: batch.id,
      channel: 'Sabadell',
    }
  );

  const hashes = canonical.map((row) => row.external_hash).filter(Boolean);
  const existingHashes = hashes.length
    ? await fetchExistingHashes(supabase, user.id, accountId, hashes)
    : [];

  const { transactions: toInsert, skipped: duplicateSkipped } = sabadellImport.filterNewTransactions(
    canonical,
    existingHashes
  );

  if (toInsert.length > 0) {
    const { error } = await supabase.from('transactions').insert(toInsert);
    if (error) {
      console.error('[imports/sabadell] insert failed', { error: error.message });
      return NextResponse.json({ error: 'insert_failed', message: error.message }, { status: 500 });
    }
  }

  const rowsInserted = toInsert.length;
  const rowsSkipped = invalidSkipped + duplicateSkipped;

  await supabase
    .from('import_batches')
    .update({
      rows_inserted: rowsInserted,
      rows_skipped: rowsSkipped,
    })
    .eq('id', batch.id);

  console.log('[imports/sabadell] import summary', {
    batch_id: batch.id,
    rows_total: parsedRows.length,
    rows_inserted: rowsInserted,
    rows_skipped: rowsSkipped,
  });

  return NextResponse.json({
    ok: true,
    batch_id: batch.id,
    rows_total: parsedRows.length,
    rows_inserted: rowsInserted,
    rows_skipped: rowsSkipped,
  });
}
