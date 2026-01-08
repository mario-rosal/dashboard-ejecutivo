import type { Database } from '@/types/database.types';
import * as impl from './engine.js';

type TransactionRow = Database['public']['Tables']['transactions']['Row'];
type TransactionInsert = Database['public']['Tables']['transactions']['Insert'];
type TransactionUpdate = Database['public']['Tables']['transactions']['Update'];
type CategoryRuleRow = Database['public']['Tables']['category_rules']['Row'];
type OverrideRow = Database['public']['Tables']['merchant_category_overrides']['Row'];
type CategoryRow = Database['public']['Tables']['categories']['Row'];
type CategoryAuditInsert = Database['public']['Tables']['category_audit']['Insert'];
type CategorySource = Database['public']['Enums']['category_source'];

export type CategorizationTransaction = Pick<
  TransactionRow,
  | 'id'
  | 'user_id'
  | 'account_id'
  | 'date'
  | 'amount'
  | 'type'
  | 'txn_type'
  | 'description_clean'
  | 'merchant_normalized'
  | 'category_id'
  | 'category_source'
  | 'category_confidence'
  | 'rule_id'
  | 'category'
>;

export type CategoryRule = Pick<
  CategoryRuleRow,
  | 'id'
  | 'user_id'
  | 'priority'
  | 'is_active'
  | 'match_field'
  | 'match_type'
  | 'pattern'
  | 'txn_type_filter'
  | 'min_amount'
  | 'max_amount'
  | 'category_id'
  | 'confidence'
  | 'created_at'
>;

export type MerchantOverride = Pick<
  OverrideRow,
  | 'id'
  | 'user_id'
  | 'merchant_normalized'
  | 'category_id'
  | 'scope'
  | 'account_id'
  | 'is_active'
  | 'created_at'
  | 'updated_at'
>;

export type CategorizationDecision = {
  category_id: string | null;
  category_source: CategorySource;
  category_confidence: number | null;
  rule_id: string | null;
  matched_by: 'override' | 'rule' | 'unknown';
};

export type BatchResult = {
  updates: TransactionInsert[];
  audits: CategoryAuditInsert[];
  skipped: number;
};

export type ManualUpdateResult = {
  update: TransactionUpdate;
  audit: CategoryAuditInsert;
  override: Database['public']['Tables']['merchant_category_overrides']['Insert'] | null;
};

export const normalizeMatchValue = impl.normalizeMatchValue as (value: unknown) => string;
export const ruleApplies = impl.ruleApplies as (rule: CategoryRule, transaction: CategorizationTransaction) => boolean;

export function evaluateCategorization(args: {
  transaction: CategorizationTransaction;
  overrides?: MerchantOverride[];
  rules?: CategoryRule[];
  force?: boolean;
}): CategorizationDecision | null {
  return impl.evaluateCategorization(args) as CategorizationDecision | null;
}

export function buildBatchUpdates(args: {
  transactions: CategorizationTransaction[];
  overrides?: MerchantOverride[];
  rules?: CategoryRule[];
  categoriesById?: Record<string, string>;
  force?: boolean;
}): BatchResult {
  return impl.buildBatchUpdates(args) as BatchResult;
}

export function buildManualUpdate(args: {
  transaction: Pick<
    TransactionRow,
    'id' | 'user_id' | 'account_id' | 'merchant_normalized' | 'category_id' | 'category'
  >;
  category: Pick<CategoryRow, 'id' | 'name'>;
  applyToMerchant: boolean;
  scope?: 'user' | 'account';
}): ManualUpdateResult | null {
  return impl.buildManualUpdate(args) as ManualUpdateResult | null;
}

export const _impl = impl;
