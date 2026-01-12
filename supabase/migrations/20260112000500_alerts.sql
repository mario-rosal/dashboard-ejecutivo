do $$
begin
  if not exists (select 1 from pg_type where typname = 'alert_status') then
    create type alert_status as enum ('open', 'ignored', 'dismissed');
  end if;
  if not exists (select 1 from pg_type where typname = 'alert_severity') then
    create type alert_severity as enum ('info', 'warning', 'danger');
  end if;
end $$;

create table if not exists alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  rule_key text not null,
  is_active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists alert_rules_user_key_idx
  on alert_rules (user_id, rule_key);

create table if not exists alert_exclusions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  rule_key text,
  match_type text not null,
  match_value text not null,
  match_value_normalized text not null,
  min_amount numeric,
  max_amount numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists alert_exclusions_user_active_idx
  on alert_exclusions (user_id, is_active);

create table if not exists alert_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  rule_key text not null,
  dedupe_key text not null,
  severity alert_severity not null default 'info',
  title text not null,
  message text not null,
  detail text,
  status alert_status not null default 'open',
  event_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists alert_events_dedupe_idx
  on alert_events (user_id, rule_key, dedupe_key);

create index if not exists alert_events_user_status_idx
  on alert_events (user_id, status, event_at desc);
