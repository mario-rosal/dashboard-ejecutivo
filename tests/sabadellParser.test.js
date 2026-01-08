const test = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const { parseSabadellBuffer } = require('../src/lib/ingest/sabadellParser');
const { filterNewTransactions } = require('../src/lib/ingest/sabadellImport');
const { inferTxnType } = require('../src/lib/ingest/normalization');

test('detecta cabecera "F. Operativa" y extrae filas', () => {
  const rows = [
    ['Resumen de cuenta', null, null],
    ['Cliente', 'Demo'],
    ['F. Operativa', 'Concepto', 'F. Valor', 'Importe', 'Saldo', 'Referencia 1', 'Referencia 2'],
    ['01/11/2025', 'COMPRA TARJ. AMAZON', '02/11/2025', '-10,50', '1000,00', 'R1', 'R2'],
    ['03/11/2025', 'TRANSFERENCIA A/DE JOHN DOE', '03/11/2025', '100,00', '1100,00', '', ''],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Hoja1');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  const parsed = parseSabadellBuffer(buffer);
  assert.strictEqual(parsed.length, 2);
  assert.strictEqual(parsed[0].date, '2025-11-01');
  assert.strictEqual(parsed[0].valueDate, '2025-11-02');
  assert.strictEqual(parsed[0].amount, -10.5);
  assert.strictEqual(parsed[0].description, 'COMPRA TARJ. AMAZON');
});

test('idempotencia: no duplica hashes existentes', () => {
  const transactions = [
    { external_hash: 'hash-1' },
    { external_hash: 'hash-2' },
    { external_hash: 'hash-1' },
  ];

  const { transactions: filtered, skipped } = filterNewTransactions(transactions, ['hash-2']);
  assert.deepStrictEqual(
    filtered.map((row) => row.external_hash),
    ['hash-1']
  );
  assert.strictEqual(skipped, 2);
});

test('clasifica txn_type segun reglas minimas', () => {
  const cases = [
    { desc: 'COMISION MANTENIMIENTO', amount: -3, expected: 'fee' },
    { desc: 'INTERESES CUENTA', amount: 2, expected: 'interest' },
    { desc: 'PAGO TGSS', amount: -50, expected: 'tax' },
    { desc: 'TRANSFERENCIA A/DE JOHN', amount: -200, expected: 'transfer' },
    { desc: 'ABONO NOMINA', amount: 1500, expected: 'income' },
    { desc: 'COMPRA TARJ. SUPERMERCADO', amount: -30, expected: 'expense' },
  ];

  for (const { desc, amount, expected } of cases) {
    assert.strictEqual(inferTxnType(desc, amount), expected);
  }
});
