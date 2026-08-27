-- 태조산 합주 캘린더 스키마
-- Supabase SQL Editor에서 한 번 실행

create extension if not exists "pgcrypto";
create extension if not exists btree_gist;

create or replace function public.hhmm_to_minutes(t text)
returns integer
language sql
immutable
as $$
  select split_part(t, ':', 1)::integer * 60
       + coalesce(nullif(split_part(t, ':', 2), '')::integer, 0);
$$;

create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  device_id text unique not null,
  cohort text not null,
  name text not null,
  last_ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists rehearsals (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time text not null,
  end_time text not null,
  team_name text not null default '',
  created_by_cohort text not null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_by_cohort text,
  updated_by_name text,
  updated_at timestamptz,
  time_span int4range
    generated always as (
      int4range(
        public.hhmm_to_minutes(start_time),
        public.hhmm_to_minutes(end_time),
        '[)'
      )
    ) stored,
  constraint rehearsals_no_overlap_excl
    exclude using gist (
      date with =,
      time_span with &&
    )
);

create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_cohort text not null,
  actor_name text not null,
  action text not null check (action in ('login', 'create', 'update', 'delete')),
  summary text not null,
  rehearsal_id uuid references rehearsals (id) on delete set null,
  ip text,
  device_id text
);

create index if not exists rehearsals_date_idx on rehearsals (date);
create index if not exists activity_logs_at_idx on activity_logs (at desc);
create index if not exists devices_last_seen_idx on devices (last_seen_at desc);

alter table devices enable row level security;
alter table rehearsals enable row level security;
alter table activity_logs enable row level security;

drop policy if exists "public read write devices" on devices;
drop policy if exists "public read write rehearsals" on rehearsals;
drop policy if exists "public read write activity_logs" on activity_logs;

create policy "public read write devices"
  on devices for all to anon, authenticated
  using (true) with check (true);

create policy "public read write rehearsals"
  on rehearsals for all to anon, authenticated
  using (true) with check (true);

create policy "public read write activity_logs"
  on activity_logs for all to anon, authenticated
  using (true) with check (true);
