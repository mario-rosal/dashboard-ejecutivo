function normalizeMatchValue(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeTxnTypeFilter(filter) {
  if (!filter) return null;
  if (Array.isArray(filter)) return filter.map((entry) => String(entry));
  return String(filter).split(',').map((entry) => entry.trim()).filter(Boolean);
}

function matchText(rule, value) {
  const pattern = normalizeMatchValue(rule.pattern);
  const normalized = normalizeMatchValue(value);

  if (!pattern || !normalized) return false;

  switch (rule.match_type) {
    case 'contains':
      return normalized.includes(pattern);
    case 'starts_with':
      return normalized.startsWith(pattern);
    case 'equals':
      return normalized === pattern;
    case 'regex': {
      if (String(rule.pattern).length > 200) return false;
      try {
        const regex = new RegExp(rule.pattern, 'i');
        return regex.test(normalized);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

function ruleApplies(rule, transaction) {
  if (!rule || rule.is_active === false) return false;
  const matchValue = transaction?.[rule.match_field];
  if (!matchValue) return false;

  const txnTypeFilter = normalizeTxnTypeFilter(rule.txn_type_filter);
  if (txnTypeFilter && txnTypeFilter.length > 0) {
    if (!transaction?.txn_type || !txnTypeFilter.includes(String(transaction.txn_type))) {
      return false;
    }
  }

  const amount = toNumber(transaction?.amount) ?? 0;
  const basisAmount = Math.abs(amount);
  const minAmount = toNumber(rule.min_amount);
  const maxAmount = toNumber(rule.max_amount);

  if (minAmount !== null && basisAmount < minAmount) return false;
  if (maxAmount !== null && basisAmount > maxAmount) return false;

  return matchText(rule, matchValue);
}

function sortRules(rules) {
  return [...rules].sort((a, b) => {
    const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
    if (priorityDiff !== 0) return priorityDiff;
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return aTime - bTime;
  });
}

function findFirstMatch(rules, transaction) {
  const sorted = sortRules(rules);
  for (const rule of sorted) {
    if (ruleApplies(rule, transaction)) {
      return rule;
    }
  }
  return null;
}

/**
 * @typedef {Object} CategorizationTransaction
 * @property {string} id
 * @property {string | null | undefined} user_id
 * @property {string | null | undefined} account_id
 * @property {number | null | undefined} amount
 * @property {string | null | undefined} txn_type
 * @property {string | null | undefined} description_clean
 * @property {string | null | undefined} merchant_normalized
 * @property {string | null | undefined} category_id
 * @property {string | null | undefined} category_source
 * @property {number | null | undefined} category_confidence
 * @property {string | null | undefined} rule_id
 * @property {string | null | undefined} category
 */

/**
 * @typedef {Object} CategoryRule
 * @property {string | null | undefined} id
 * @property {string | null | undefined} user_id
 * @property {number | null | undefined} priority
 * @property {boolean | null | undefined} is_active
 * @property {string | null | undefined} match_field
 * @property {string | null | undefined} match_type
 * @property {string | null | undefined} pattern
 * @property {string[] | null | undefined} txn_type_filter
 * @property {number | null | undefined} min_amount
 * @property {number | null | undefined} max_amount
 * @property {string | null | undefined} category_id
 * @property {number | null | undefined} confidence
 * @property {string | null | undefined} created_at
 */

/**
 * @typedef {Object} MerchantOverride
 * @property {string | null | undefined} id
 * @property {string | null | undefined} user_id
 * @property {string | null | undefined} merchant_normalized
 * @property {string | null | undefined} category_id
 * @property {string | null | undefined} scope
 * @property {string | null | undefined} account_id
 * @property {boolean | null | undefined} is_active
 * @property {string | null | undefined} created_at
 * @property {string | null | undefined} updated_at
 */

/**
 * @param {{ transaction: CategorizationTransaction, overrides?: MerchantOverride[], rules?: CategoryRule[], force?: boolean }} args
 */
function evaluateCategorization({ transaction, overrides = [], rules = [], force = false }) {
  if (!transaction) return null;

  if (transaction.category_source === 'user' && !force) {
    return null;
  }

  const merchant = transaction.merchant_normalized;
  if (merchant) {
    const accountOverride = overrides.find(
      (override) =>
        override.is_active !== false &&
        override.scope === 'account' &&
        override.account_id &&
        transaction.account_id &&
        override.account_id === transaction.account_id &&
        override.merchant_normalized === merchant
    );

    if (accountOverride) {
      return {
        category_id: accountOverride.category_id,
        category_source: 'user',
        category_confidence: 1,
        rule_id: null,
        matched_by: 'override',
      };
    }

    const userOverride = overrides.find(
      (override) =>
        override.is_active !== false &&
        override.scope === 'user' &&
        override.merchant_normalized === merchant
    );

    if (userOverride) {
      return {
        category_id: userOverride.category_id,
        category_source: 'user',
        category_confidence: 1,
        rule_id: null,
        matched_by: 'override',
      };
    }
  }

  const userRules = rules.filter((rule) => rule.user_id && rule.user_id === transaction.user_id);
  const globalRules = rules.filter((rule) => !rule.user_id);

  const matchedRule = findFirstMatch(userRules, transaction) || findFirstMatch(globalRules, transaction);
  if (matchedRule) {
    return {
      category_id: matchedRule.category_id,
      category_source: 'rule',
      category_confidence: toNumber(matchedRule.confidence) ?? 0.9,
      rule_id: matchedRule.id ?? null,
      matched_by: 'rule',
    };
  }

  return {
    category_id: null,
    category_source: 'unknown',
    category_confidence: null,
    rule_id: null,
    matched_by: 'unknown',
  };
}

function buildTransactionUpdate(transaction, decision, categoriesById = {}) {
  if (!decision) return null;

  const currentSource = transaction.category_source ?? 'unknown';
  const currentCategory = transaction.category_id ?? null;
  const currentRule = transaction.rule_id ?? null;

  if (
    decision.category_source === currentSource &&
    decision.category_id === currentCategory &&
    decision.rule_id === currentRule
  ) {
    return null;
  }

  const categoryName = decision.category_id ? categoriesById[decision.category_id] : null;
  const fallbackCategory = categoryName || (decision.category_id ? null : 'Sin Categoria');

  return {
    id: transaction.id,
    category_id: decision.category_id,
    category_source: decision.category_source,
    category_confidence: decision.category_confidence,
    rule_id: decision.rule_id,
    category: fallbackCategory ?? transaction.category ?? 'Sin Categoria',
    updated_at: new Date().toISOString(),
  };
}

function buildAuditRecord(transaction, decision) {
  if (!decision) return null;

  return {
    transaction_id: transaction.id,
    user_id: transaction.user_id ?? null,
    previous_category_id: transaction.category_id ?? null,
    new_category_id: decision.category_id ?? null,
    source: decision.category_source ?? 'unknown',
    rule_id: decision.rule_id ?? null,
  };
}

/**
 * @param {{
 *   transactions: CategorizationTransaction[],
 *   overrides?: MerchantOverride[],
 *   rules?: CategoryRule[],
 *   categoriesById?: Record<string, string>,
 *   force?: boolean
 * }} args
 */
function buildBatchUpdates({ transactions, overrides = [], rules = [], categoriesById = {}, force = false }) {
  const updates = [];
  const audits = [];
  let skipped = 0;

  for (const transaction of transactions) {
    const decision = evaluateCategorization({ transaction, overrides, rules, force });
    if (!decision) {
      skipped += 1;
      continue;
    }

    const update = buildTransactionUpdate(transaction, decision, categoriesById);
    if (!update) {
      skipped += 1;
      continue;
    }

    updates.push(update);
    const audit = buildAuditRecord(transaction, decision);
    if (audit) audits.push(audit);
  }

  return { updates, audits, skipped };
}

function buildManualUpdate({ transaction, category, applyToMerchant, scope }) {
  if (!transaction || !category) return null;

  const update = {
    id: transaction.id,
    category_id: category.id,
    category_source: 'user',
    category_confidence: 1,
    rule_id: null,
    category: category.name,
    updated_at: new Date().toISOString(),
  };

  const audit = {
    transaction_id: transaction.id,
    user_id: transaction.user_id ?? null,
    previous_category_id: transaction.category_id ?? null,
    new_category_id: category.id,
    source: 'user',
    rule_id: null,
  };

  let override = null;
  if (applyToMerchant) {
    if (!transaction.merchant_normalized) {
      throw new Error('merchant_normalized requerido para override');
    }
    const scopeValue = scope || 'user';
    override = {
      user_id: transaction.user_id,
      merchant_normalized: transaction.merchant_normalized,
      category_id: category.id,
      scope: scopeValue,
      account_id: scopeValue === 'account' ? transaction.account_id : null,
      is_active: true,
      updated_at: new Date().toISOString(),
    };
  }

  return { update, audit, override };
}

module.exports = {
  normalizeMatchValue,
  ruleApplies,
  evaluateCategorization,
  buildBatchUpdates,
  buildManualUpdate,
};
