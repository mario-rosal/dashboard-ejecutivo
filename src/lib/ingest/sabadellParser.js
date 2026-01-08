const XLSX = require('xlsx');

const HEADER_KEYS = {
  'f. operativa': 'date',
  'f. valor': 'valueDate',
  'concepto': 'description',
  'importe': 'amount',
  'saldo': 'balance',
  'referencia 1': 'reference1',
  'referencia 2': 'reference2',
};

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function toBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  if (ArrayBuffer.isView(input)) {
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new Error('Unsupported buffer input');
}

function parseExcelDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number') {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return date.toISOString().slice(0, 10);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:[ T].*)?$/);
    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year > 1900) {
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.toISOString().slice(0, 10);
      }
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return null;
}

function parseAmount(value) {
  if (typeof value === 'number') return value;
  if (value === null || value === undefined || value === '') return 0;

  let str = String(value).trim();
  str = str.replace(/[^0-9.,-]/g, '');
  if (!str) return 0;

  const hasComma = str.includes(',');
  const hasDot = str.includes('.');

  if (hasComma && hasDot) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (hasComma) {
    str = str.replace(',', '.');
  } else if (hasDot && (str.match(/\./g) || []).length > 1) {
    str = str.replace(/\./g, '');
  }

  const parsed = Number.parseFloat(str);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseSabadellBuffer(input) {
  const buffer = toBuffer(input);
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName =
    workbook.SheetNames.find((name) => name.toLowerCase() === 'hoja1') || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: false });

  const headerIndex = rows.findIndex((row) =>
    Array.isArray(row) && row.some((cell) => normalizeHeader(cell) === 'f. operativa')
  );

  if (headerIndex === -1) {
    throw new Error('No se encontro la cabecera "F. Operativa"');
  }

  const headerRow = rows[headerIndex] || [];
  const headerMap = headerRow.reduce((acc, cell, idx) => {
    const key = HEADER_KEYS[normalizeHeader(cell)];
    if (key) acc[key] = idx;
    return acc;
  }, {});

  const requiredKeys = ['date', 'description', 'amount'];
  const missing = requiredKeys.filter((key) => headerMap[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`Faltan columnas requeridas: ${missing.join(', ')}`);
  }

  const dataRows = rows.slice(headerIndex + 1);
  const output = [];

  for (const row of dataRows) {
    if (!Array.isArray(row)) continue;
    const isEmpty = row.every(
      (cell) => cell === null || cell === undefined || String(cell).trim() === ''
    );
    if (isEmpty) continue;

    const rawDate = row[headerMap.date];
    const rawValueDate = row[headerMap.valueDate];
    const rawDescription = row[headerMap.description];
    const rawAmount = row[headerMap.amount];

    const date = parseExcelDate(rawDate);
    const valueDate = parseExcelDate(rawValueDate);
    const description = rawDescription !== undefined && rawDescription !== null ? String(rawDescription) : '';
    const amount = parseAmount(rawAmount);

    if (!date || !description) continue;

    output.push({
      date,
      valueDate,
      description,
      amount,
      balance: parseAmount(row[headerMap.balance]),
      reference1: row[headerMap.reference1] ? String(row[headerMap.reference1]) : null,
      reference2: row[headerMap.reference2] ? String(row[headerMap.reference2]) : null,
    });
  }

  return output;
}

module.exports = {
  parseSabadellBuffer,
  parseExcelDate,
  parseAmount,
  normalizeHeader,
};
