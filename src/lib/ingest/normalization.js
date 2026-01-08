const crypto = require('crypto');

function normalizeWhitespace(value) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collapseRepeatedSymbols(value) {
  return String(value ?? '').replace(/([^\w\s])\1+/g, '$1');
}

function normalizeDescription(raw) {
  const upper = normalizeWhitespace(raw).toUpperCase();
  return normalizeWhitespace(collapseRepeatedSymbols(upper));
}

function stripDiacritics(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function cleanupMerchantCandidate(value) {
  let cleaned = normalizeWhitespace(value);
  cleaned = cleaned.replace(/^[0-9X*]{6,}\s+/i, '');
  cleaned = cleaned.replace(/^N\.?\s*/i, '');
  cleaned = cleaned.replace(/^PAGO DE\s+/i, '');
  cleaned = cleaned.replace(/^RECIBO\s+/i, '');
  return cleaned;
}

function extractMerchant(descriptionClean) {
  const cleaned = normalizeWhitespace(descriptionClean);
  const patterns = [
    /^COMPRA TARJ\.?\s+(.+)$/,
    /^ADEUDO RECIBO\s+(.+)$/,
    /^TRANSFERENCIA\s+(?:A\/DE|A|DE)\s+(.+)$/,
    /^NOMINA DE\s+(.+)$/,
    /^PRESTAMO(?:S)?\s+(.+)$/,
    /^GAS\s+(.+)$/,
    /^TELEFONOS?\s+(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      const candidate = cleanupMerchantCandidate(match[1]);
      if (!candidate) continue;
      const merchant = normalizeWhitespace(collapseRepeatedSymbols(candidate.toUpperCase()));
      if (!merchant) continue;
      return { merchantRaw: merchant, merchantNormalized: merchant };
    }
  }

  return { merchantRaw: null, merchantNormalized: null };
}

function inferTxnType(descriptionClean, amount) {
  const normalized = stripDiacritics(descriptionClean).toUpperCase();

  if (normalized.includes('COMISION')) return 'fee';
  if (normalized.includes('INTERESES')) return 'interest';
  if (
    normalized.includes('TGSS') ||
    normalized.includes('HACIENDA') ||
    normalized.includes('SEGURIDAD SOCIAL') ||
    normalized.includes('SEGUROS SOCIALES') ||
    normalized.includes('IMPUEST')
  ) {
    return 'tax';
  }
  if (normalized.includes('TRANSFERENCIA')) return 'transfer';
  if (amount > 0) return 'income';
  if (amount < 0) return 'expense';
  return 'unknown';
}

function buildExternalHash({ userId, accountId, date, amount, descriptionRaw, bankSource }) {
  const amountKey = Number.isFinite(amount) ? amount.toFixed(2) : String(amount ?? '');
  const key = [userId ?? '', accountId ?? '', date ?? '', amountKey, descriptionRaw ?? '', bankSource ?? ''].join('|');
  return crypto.createHash('sha256').update(key).digest('hex');
}

module.exports = {
  normalizeDescription,
  extractMerchant,
  inferTxnType,
  buildExternalHash,
  normalizeWhitespace,
  collapseRepeatedSymbols,
  stripDiacritics,
};
