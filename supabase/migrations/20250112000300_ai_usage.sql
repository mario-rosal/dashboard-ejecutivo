create table if not exists ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  feature text not null,
  model text not null,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  created_at timestamptz not null default now(),
  request_id text,
  metadata jsonb
);

create index if not exists ai_usage_user_created_idx
  on ai_usage (user_id, created_at desc);
