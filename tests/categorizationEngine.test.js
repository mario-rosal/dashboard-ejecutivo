const test = require('node:test');
const assert = require('node:assert');
const engine = require('../src/lib/categorization/engine');

test('precedencia: user > override > rule > unknown', () => {
  const transaction = {
    id: 'tx-1',
    user_id: 'user-1',
    account_id: 'acc-1',
    merchant_normalized: 'AWS',
    description_clean: 'COMPRA TARJ. AWS',
    amount: -10,
    txn_type: 'expense',
    category_source: 'user',
  };

  const overrides = [
    {
      scope: 'account',
      account_id: 'acc-1',
      merchant_normalized: 'AWS',
      category_id: 'cat-account',
      is_active: true,
    },
  ];

  const rules = [
    {
      id: 'rule-1',
      user_id: null,
      priority: 10,
      is_active: true,
      match_field: 'merchant_normalized',
      match_type: 'contains',
      pattern: 'AWS',
      category_id: 'cat-rule',
      confidence: 0.9,
    },
  ];

  const skipped = engine.evaluateCategorization({ transaction, overrides, rules, force: false });
  assert.strictEqual(skipped, null);

  const decisionOverride = engine.evaluateCategorization({
    transaction: { ...transaction, category_source: 'unknown' },
    overrides,
    rules,
    force: false,
  });
  assert.strictEqual(decisionOverride.category_id, 'cat-account');
  assert.strictEqual(decisionOverride.category_source, 'user');

  const decisionRule = engine.evaluateCategorization({
    transaction: { ...transaction, category_source: 'unknown', merchant_normalized: 'AWS' },
    overrides: [],
    rules,
    force: false,
  });
  assert.strictEqual(decisionRule.category_id, 'cat-rule');
  assert.strictEqual(decisionRule.category_source, 'rule');

  const decisionUnknown = engine.evaluateCategorization({
    transaction: { ...transaction, category_source: 'unknown', merchant_normalized: 'OTRO' },
    overrides: [],
    rules: [],
    force: false,
  });
  assert.strictEqual(decisionUnknown.category_id, null);
  assert.strictEqual(decisionUnknown.category_source, 'unknown');
});

test('matchers: contains/regex/starts_with', () => {
  const baseTx = {
    user_id: 'user-1',
    account_id: 'acc-1',
    description_clean: 'TRANSFERENCIA A/DE JOHN DOE',
    merchant_normalized: 'OPENAI',
    amount: -10,
    txn_type: 'transfer',
    category_source: 'unknown',
  };

  const containsRule = {
    match_field: 'merchant_normalized',
    match_type: 'contains',
    pattern: 'OPENAI',
    is_active: true,
  };
  assert.strictEqual(engine.ruleApplies(containsRule, baseTx), true);

  const regexRule = {
    match_field: 'merchant_normalized',
    match_type: 'regex',
    pattern: 'OPENAI|AWS',
    is_active: true,
  };
  assert.strictEqual(engine.ruleApplies(regexRule, baseTx), true);

  const startsRule = {
    match_field: 'description_clean',
    match_type: 'starts_with',
    pattern: 'TRANSFERENCIA',
    txn_type_filter: ['transfer'],
    is_active: true,
  };
  assert.strictEqual(engine.ruleApplies(startsRule, baseTx), true);
});

test('PATCH manual: crea override si apply_to_merchant=true', () => {
  const transaction = {
    id: 'tx-1',
    user_id: 'user-1',
    account_id: 'acc-1',
    merchant_normalized: 'AWS',
    category_id: null,
  };
  const category = { id: 'cat-1', name: 'Infra Cloud' };

  const result = engine.buildManualUpdate({
    transaction,
    category,
    applyToMerchant: true,
    scope: 'account',
  });

  assert.ok(result.override);
  assert.strictEqual(result.override.scope, 'account');
  assert.strictEqual(result.override.account_id, 'acc-1');
  assert.strictEqual(result.override.merchant_normalized, 'AWS');
});

test('batch idempotente: segunda pasada no genera updates', () => {
  const transactions = [
    {
      id: 'tx-1',
      user_id: 'user-1',
      account_id: 'acc-1',
      merchant_normalized: 'OPENAI',
      description_clean: 'COMPRA TARJ. OPENAI',
      amount: -10,
      txn_type: 'expense',
      category_source: 'unknown',
      category_id: null,
      rule_id: null,
      category: 'Sin Categoria',
    },
  ];

  const rules = [
    {
      id: 'rule-1',
      user_id: null,
      priority: 10,
      is_active: true,
      match_field: 'merchant_normalized',
      match_type: 'contains',
      pattern: 'OPENAI',
      category_id: 'cat-1',
      confidence: 0.9,
    },
  ];

  const categoriesById = { 'cat-1': 'SaaS / Suscripciones' };
  const first = engine.buildBatchUpdates({ transactions, rules, categoriesById, force: false });
  assert.strictEqual(first.updates.length, 1);

  const updatedTx = { ...transactions[0], ...first.updates[0], category_source: 'rule', rule_id: 'rule-1' };
  const second = engine.buildBatchUpdates({ transactions: [updatedTx], rules, categoriesById, force: false });
  assert.strictEqual(second.updates.length, 0);
});
