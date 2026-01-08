const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { parseSabadellBuffer } = require('../src/lib/ingest/sabadellParser');
const { buildCanonicalTransactions, filterNewTransactions } = require('../src/lib/ingest/sabadellImport');

const CHUNK_SIZE = 500;

function parseArgs(argv) {
  const args = {
    file: null,
    user: null,
    account: null,
    bankSource: 'sabadell',
  };

  const positional = argv.filter((item) => !item.startsWith('--'));
  if (positional.length > 0) args.file = positional[0];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--user') args.user = argv[i + 1];
    if (arg === '--account') args.account = argv[i + 1];
    if (arg === '--bank-source') args.bankSource = argv[i + 1];
  }

  return args;
}

function usage() {
  console.log('Uso: node scripts/import-sabadell.js <archivo> --user <uuid> --account <id> [--bank-source sabadell]');
}

async function fetchExistingHashes(supabase, userId, accountId, hashes) {
  const existing = [];
  for (let i = 0; i < hashes.length; i += CHUNK_SIZE) {
    const chunk = hashes.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase
      .from('transactions')
      .select('external_hash')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .in('external_hash', chunk);

    if (error) throw error;
    for (const row of data || []) {
      if (row.external_hash) existing.push(row.external_hash);
    }
  }
  return existing;
}

async function main() {
  const { file, user, account, bankSource } = parseArgs(process.argv.slice(2));
  if (!file || !user || !account) {
    usage();
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const fullPath = path.resolve(file);
  const buffer = fs.readFileSync(fullPath);
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const rows = parseSabadellBuffer(buffer);

  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      user_id: user,
      bank_source: bankSource,
      file_name: path.basename(fullPath),
      file_hash: fileHash,
      rows_total: rows.length,
      rows_inserted: 0,
      rows_skipped: 0,
    })
    .select('id')
    .single();

  if (batchError || !batch) {
    console.error('[import-sabadell] batch create failed', batchError);
    process.exit(1);
  }

  const { transactions: canonical, skipped: invalidSkipped } = buildCanonicalTransactions(rows, {
    userId: user,
    accountId: account,
    bankSource,
    importBatchId: batch.id,
    channel: 'Sabadell',
  });

  const hashes = canonical.map((row) => row.external_hash).filter(Boolean);
  const existingHashes = hashes.length
    ? await fetchExistingHashes(supabase, user, account, hashes)
    : [];

  const { transactions: toInsert, skipped: duplicateSkipped } = filterNewTransactions(
    canonical,
    existingHashes
  );

  if (toInsert.length > 0) {
    const { error } = await supabase.from('transactions').insert(toInsert);
    if (error) {
      console.error('[import-sabadell] insert failed', error);
      process.exit(1);
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

  console.log('[import-sabadell] summary', {
    batch_id: batch.id,
    rows_total: rows.length,
    rows_inserted: rowsInserted,
    rows_skipped: rowsSkipped,
  });
}

main().catch((err) => {
  console.error('[import-sabadell] error', err);
  process.exit(1);
});
