insert into categories (name, slug, type)
values
  ('Infra Cloud', 'infra-cloud', 'expense'),
  ('SaaS / Suscripciones', 'saas-suscripciones', 'expense'),
  ('Marketing', 'marketing', 'expense'),
  ('Comisiones bancarias', 'comisiones-bancarias', 'financial'),
  ('Intereses', 'intereses', 'financial'),
  ('Impuestos / SS', 'impuestos-ss', 'expense'),
  ('Transferencias', 'transferencias', 'transfer'),
  ('Nominas', 'nominas', 'income'),
  ('Seguros', 'seguros', 'expense'),
  ('Prestamos', 'prestamos', 'financial'),
  ('Servicios profesionales', 'servicios-profesionales', 'expense'),
  ('Suministros', 'suministros', 'expense'),
  ('Telecomunicaciones', 'telecomunicaciones', 'expense'),
  ('Alimentacion', 'alimentacion', 'expense'),
  ('Viajes', 'viajes', 'expense'),
  ('Compras', 'compras', 'expense'),
  ('Salud y Fitness', 'salud-fitness', 'expense'),
  ('Comunidad', 'comunidad', 'expense')
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
    'Transferencias: TRANSFERENCIA',
    'Nominas: NOMINA',
    'Impuestos/SS: IMPUESTOS',
    'Impuestos/SS: SEGUROS SOCIALES',
    'Prestamos: PRESTAMO',
    'Seguros: LINEA DIRECTA',
    'Seguros: BARKIBU',
    'Servicios profesionales: ASESOR',
    'Suministros: AGUAS',
    'Suministros: TOTALENERG',
    'Telecomunicaciones: PEPEPHONE',
    'Alimentacion: MERCADONA',
    'Compras: AMAZON',
    'Viajes: RYANAIR',
    'Salud y Fitness: BASIC-FIT',
    'Comunidad: CDAD PROP'
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
    ('Transferencias: TRANSFERENCIA', 70, 'description_clean'::category_match_field, 'starts_with'::category_match_type, 'TRANSFERENCIA', array['transfer'], 'transferencias', 0.9),
    ('Nominas: NOMINA', 95, 'description_clean'::category_match_field, 'starts_with'::category_match_type, 'NOMINA', array['income'], 'nominas', 0.95),
    ('Impuestos/SS: IMPUESTOS', 85, 'description_clean'::category_match_field, 'contains'::category_match_type, 'IMPUEST', null::text[], 'impuestos-ss', 0.9),
    ('Impuestos/SS: SEGUROS SOCIALES', 85, 'description_clean'::category_match_field, 'contains'::category_match_type, 'SEGUROS SOCIALES', null::text[], 'impuestos-ss', 0.9),
    ('Prestamos: PRESTAMO', 85, 'description_clean'::category_match_field, 'contains'::category_match_type, 'PRESTAMO', null::text[], 'prestamos', 0.9),
    ('Seguros: LINEA DIRECTA', 90, 'merchant_normalized'::category_match_field, 'contains'::category_match_type, 'LINEA DIRECTA', null::text[], 'seguros', 0.9),
    ('Seguros: BARKIBU', 90, 'merchant_normalized'::category_match_field, 'contains'::category_match_type, 'BARKIBU', null::text[], 'seguros', 0.9),
    ('Servicios profesionales: ASESOR', 85, 'merchant_normalized'::category_match_field, 'contains'::category_match_type, 'ASESOR', null::text[], 'servicios-profesionales', 0.9),
    ('Suministros: AGUAS', 85, 'merchant_normalized'::category_match_field, 'contains'::category_match_type, 'AGUAS', null::text[], 'suministros', 0.9),
    ('Suministros: TOTALENERG', 85, 'merchant_normalized'::category_match_field, 'contains'::category_match_type, 'TOTALENERG', null::text[], 'suministros', 0.9),
    ('Telecomunicaciones: PEPEPHONE', 85, 'merchant_normalized'::category_match_field, 'contains'::category_match_type, 'PEPEPHONE', null::text[], 'telecomunicaciones', 0.9),
    ('Alimentacion: MERCADONA', 85, 'merchant_normalized'::category_match_field, 'contains'::category_match_type, 'MERCADONA', null::text[], 'alimentacion', 0.9),
    ('Compras: AMAZON', 85, 'merchant_normalized'::category_match_field, 'contains'::category_match_type, 'AMAZON', null::text[], 'compras', 0.9),
    ('Viajes: RYANAIR', 85, 'merchant_normalized'::category_match_field, 'contains'::category_match_type, 'RYANAIR', null::text[], 'viajes', 0.9),
    ('Salud y Fitness: BASIC-FIT', 85, 'merchant_normalized'::category_match_field, 'contains'::category_match_type, 'BASIC-FIT', null::text[], 'salud-fitness', 0.9),
    ('Comunidad: CDAD PROP', 80, 'merchant_normalized'::category_match_field, 'regex'::category_match_type, 'CDAD\\.?\\s*PROP', null::text[], 'comunidad', 0.9)
) as rule(name, priority, match_field, match_type, pattern, txn_type_filter, category_slug, confidence)
join categories on categories.slug = rule.category_slug;
