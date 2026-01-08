create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'txn_type') then
    create type txn_type as enum ('income', 'expense', 'transfer', 'fee', 'tax', 'interest', 'unknown');
  end if;
  if not exists (select 1 from pg_type where typname = 'category_source') then
    create type category_source as enum ('rule', 'ml', 'user', 'unknown');
  end if;
  if not exists (select 1 from pg_type where typname = 'category_type') then
    create type category_type as enum ('income', 'expense', 'transfer', 'financial', 'other');
  end if;
end $$;

create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  bank_source text not null,
  file_name text not null,
  file_hash text not null,
  imported_at timestamptz not null default now(),
  rows_total integer not null default 0,
  rows_inserted integer not null default 0,
  rows_skipped integer not null default 0
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid,
  name text not null,
  slug text not null,
  type category_type not null,
  created_at timestamptz not null default now()
);

create unique index if not exists categories_slug_key on categories (slug);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'categories_parent_id_fkey') then
    alter table categories
      add constraint categories_parent_id_fkey
      foreign key (parent_id) references categories(id) on delete set null;
  end if;
end $$;

alter table transactions
  add column if not exists account_id text,
  add column if not exists bank_source text,
  add column if not exists value_date date,
  add column if not exists currency text default 'EUR',
  add column if not exists description_raw text,
  add column if not exists description_clean text,
  add column if not exists merchant_raw text,
  add column if not exists merchant_normalized text,
  add column if not exists txn_type txn_type default 'unknown',
  add column if not exists category_id uuid,
  add column if not exists category_source category_source default 'unknown',
  add column if not exists category_confidence double precision,
  add column if not exists rule_id uuid,
  add column if not exists import_batch_id uuid,
  add column if not exists external_hash text,
  add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_category_id_fkey') then
    alter table transactions
      add constraint transactions_category_id_fkey
      foreign key (category_id) references categories(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_import_batch_id_fkey') then
    alter table transactions
      add constraint transactions_import_batch_id_fkey
      foreign key (import_batch_id) references import_batches(id) on delete set null;
  end if;
end $$;

create unique index if not exists transactions_external_hash_key
  on transactions (user_id, account_id, external_hash);
