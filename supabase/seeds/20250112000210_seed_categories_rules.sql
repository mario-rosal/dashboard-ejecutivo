insert into categories (name, slug, type)
values
  ('Infra Cloud', 'infra-cloud', 'expense'),
  ('SaaS / Suscripciones', 'saas-suscripciones', 'expense'),
  ('Marketing', 'marketing', 'expense'),
  ('Comisiones bancarias', 'comisiones-bancarias', 'financial'),
  ('Intereses', 'intereses', 'financial'),
  ('Impuestos / SS', 'impuestos-ss', 'expense'),
  ('Transferencias', 'transferencias', 'transfer')
on conflict (slug) do update
  set name = excluded.name,
      type = excluded.type;

delete from category_rules
where user_id is null
  and name in (
    'Infra Cloud: AWS',
    'Infra Cloud: LINODE',
    'Infra Cloud: AKAMAI',
    'SaaS: OPENAI',
    'SaaS: CHATGPT',
    'Marketing: LINKEDIN',
    'Marketing: SORTLIST',
    'Comisiones bancarias: COMISION',
    'Intereses: INTERESES',
    'Impuestos/SS: TGSS',
    'Impuestos/SS: HACIENDA',
    'Transferencias: TRANSFERENCIA'
  );

insert into category_rules (
  user_id,
  name,
  priority,
  match_field,
  match_type,
  pattern,
  txn_type_filter,
  category_id,
  confidence
)
select
  null,
  rule.name,
  rule.priority,
  rule.match_field,
  rule.match_type,
  rule.pattern,
  rule.txn_type_filter,
  categories.id,
  rule.confidence
from (
  values
    ('Infra Cloud: AWS', 100, 'merchant_normalized'::category_match_field, 'contains'::category_match_type, 'AWS', null::text[], 'infra-cloud', 0.9),
    ('Infra Cloud: LINODE', 100, 'merchant_normalized'::category_match_field, 'contains'::category_match_type, 'LINODE', null::text[], 'infra-cloud', 0.9),
    ('Infra Cloud: AKAMAI', 100, 'merchant_normalized'::category_match_field, 'contains'::category_match_type, 'AKAMAI', null::text[], 'infra-cloud', 0.9),
    ('SaaS: OPENAI', 90, 'merchant_normalized'::category_match_field, 'contains'::category_match_type, 'OPENAI', null::text[], 'saas-suscripciones', 0.9),
    ('SaaS: CHATGPT', 90, 'merchant_normalized'::category_match_field, 'contains'::category_match_type, 'CHATGPT', null::text[], 'saas-suscripciones', 0.9),
    ('Marketing: LINKEDIN', 90, 'merchant_normalized'::category_match_field, 'contains'::category_match_type, 'LINKEDIN', null::text[], 'marketing', 0.9),
    ('Marketing: SORTLIST', 90, 'merchant_normalized'::category_match_field, 'contains'::category_match_type, 'SORTLIST', null::text[], 'marketing', 0.9),
    ('Comisiones bancarias: COMISION', 80, 'description_clean'::category_match_field, 'contains'::category_match_type, 'COMISION', array['fee'], 'comisiones-bancarias', 0.95),
    ('Intereses: INTERESES', 80, 'description_clean'::category_match_field, 'contains'::category_match_type, 'INTERESES', array['interest'], 'intereses', 0.95),
    ('Impuestos/SS: TGSS', 80, 'description_clean'::category_match_field, 'contains'::category_match_type, 'TGSS', array['tax'], 'impuestos-ss', 0.95),
    ('Impuestos/SS: HACIENDA', 80, 'description_clean'::category_match_field, 'contains'::category_match_type, 'HACIENDA', array['tax'], 'impuestos-ss', 0.95),
    ('Transferencias: TRANSFERENCIA', 70, 'description_clean'::category_match_field, 'starts_with'::category_match_type, 'TRANSFERENCIA', array['transfer'], 'transferencias', 0.9)
) as rule(name, priority, match_field, match_type, pattern, txn_type_filter, category_slug, confidence)
join categories on categories.slug = rule.category_slug;
