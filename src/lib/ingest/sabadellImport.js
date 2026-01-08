const {
  normalizeDescription,
  extractMerchant,
  inferTxnType,
  buildExternalHash,
} = require('./normalization');

function buildCanonicalTransactions(rows, context) {
  const output = [];
  let skipped = 0;

  for (const row of rows) {
    if (!row?.date || !row?.description) {
      skipped += 1;
      continue;
    }

    const amount = Number(row.amount ?? 0);
    if (!Number.isFinite(amount)) {
      skipped += 1;
      continue;
    }

    const descriptionRaw = String(row.description ?? '').trim();
    const descriptionClean = normalizeDescription(descriptionRaw);
    const { merchantRaw, merchantNormalized } = extractMerchant(descriptionClean);
    const txnType = inferTxnType(descriptionClean, amount);

    output.push({
      user_id: context.userId ?? null,
      account_id: context.accountId ?? null,
      bank_source: context.bankSource ?? null,
      date: row.date,
      value_date: row.valueDate ?? null,
      amount,
      currency: context.currency ?? 'EUR',
      description_raw: descriptionRaw,
      description_clean: descriptionClean,
      merchant_raw: merchantRaw,
      merchant_normalized: merchantNormalized,
      txn_type: txnType,
      category_id: null,
      category_source: 'unknown',
      category_confidence: null,
      rule_id: null,
      import_batch_id: context.importBatchId ?? null,
      external_hash: buildExternalHash({
        userId: context.userId ?? '',
        accountId: context.accountId ?? '',
        date: row.date,
        amount,
        descriptionRaw,
        bankSource: context.bankSource ?? '',
      }),
      description: descriptionRaw,
      type: amount < 0 ? 'expense' : 'income',
      category: 'Sin Categoria',
      channel: context.channel ?? 'Sabadell',
      is_anomaly: false,
    });
  }

  return { transactions: output, skipped };
}

function filterNewTransactions(transactions, existingHashes) {
  const existing = new Set(existingHashes.filter(Boolean));
  const output = [];
  let skipped = 0;

  for (const tx of transactions) {
    if (!tx.external_hash || existing.has(tx.external_hash)) {
      skipped += 1;
      continue;
    }
    existing.add(tx.external_hash);
    output.push(tx);
  }

  return { transactions: output, skipped };
}

module.exports = {
  buildCanonicalTransactions,
  filterNewTransactions,
};
