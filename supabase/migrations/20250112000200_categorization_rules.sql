do $$
begin
  if not exists (select 1 from pg_type where typname = 'category_match_field') then
    create type category_match_field as enum ('description_clean', 'merchant_normalized');
  end if;
  if not exists (select 1 from pg_type where typname = 'category_match_type') then
    create type category_match_type as enum ('contains', 'regex', 'starts_with', 'equals');
  end if;
  if not exists (select 1 from pg_type where typname = 'override_scope') then
    create type override_scope as enum ('user', 'account');
  end if;
end $$;

create table if not exists category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  name text not null,
  priority integer not null default 0,
  is_active boolean not null default true,
  match_field category_match_field not null,
  match_type category_match_type not null,
  pattern text not null,
  txn_type_filter text[],
  min_amount numeric,
  max_amount numeric,
  category_id uuid not null,
  confidence double precision not null default 0.9,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists category_rules_user_active_priority_idx
  on category_rules (user_id, is_active, priority desc, created_at asc);

create index if not exists category_rules_active_priority_idx
  on category_rules (is_active, priority desc, created_at asc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'category_rules_category_id_fkey') then
    alter table category_rules
      add constraint category_rules_category_id_fkey
      foreign key (category_id) references categories(id) on delete cascade;
  end if;
end $$;

create table if not exists merchant_category_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  merchant_normalized text not null,
  category_id uuid not null,
  scope override_scope not null default 'user',
  account_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, scope, account_id, merchant_normalized)
);

create index if not exists merchant_overrides_user_merchant_idx
  on merchant_category_overrides (user_id, merchant_normalized);

create unique index if not exists merchant_overrides_scope_unique_idx
  on merchant_category_overrides (user_id, scope, coalesce(account_id, ''), merchant_normalized);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'merchant_overrides_category_id_fkey') then
    alter table merchant_category_overrides
      add constraint merchant_overrides_category_id_fkey
      foreign key (category_id) references categories(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'merchant_overrides_scope_account_chk') then
    alter table merchant_category_overrides
      add constraint merchant_overrides_scope_account_chk
      check (scope <> 'account' or account_id is not null);
  end if;
end $$;

create table if not exists category_audit (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  user_id uuid,
  previous_category_id uuid,
  new_category_id uuid,
  source category_source not null default 'unknown',
  rule_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists category_audit_transaction_idx
  on category_audit (transaction_id, created_at desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'category_audit_transaction_id_fkey') then
    alter table category_audit
      add constraint category_audit_transaction_id_fkey
      foreign key (transaction_id) references transactions(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'category_audit_prev_category_id_fkey') then
    alter table category_audit
      add constraint category_audit_prev_category_id_fkey
      foreign key (previous_category_id) references categories(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'category_audit_new_category_id_fkey') then
    alter table category_audit
      add constraint category_audit_new_category_id_fkey
      foreign key (new_category_id) references categories(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'category_audit_rule_id_fkey') then
    alter table category_audit
      add constraint category_audit_rule_id_fkey
      foreign key (rule_id) references category_rules(id) on delete set null;
  end if;
end $$;

create or replace function get_uncategorized_merchants(p_user_id uuid, p_limit integer default 50)
returns table (
  merchant_key text,
  merchant_normalized text,
  description_clean text,
  txn_count integer,
  total_amount numeric
) language sql stable as $$
  select
    coalesce(nullif(merchant_normalized, ''), nullif(description_clean, '')) as merchant_key,
    merchant_normalized,
    description_clean,
    count(*)::int as txn_count,
    sum(amount) as total_amount
  from transactions
  where user_id = p_user_id
    and (category_id is null or category_source = 'unknown')
    and (merchant_normalized is not null or description_clean is not null)
  group by merchant_key, merchant_normalized, description_clean
  order by txn_count desc
  limit coalesce(p_limit, 50);
$$;
