-- 태조산 합주 캘린더 스키마 (보안 강화: 멤버 PIN + 세션 RPC)
-- Supabase SQL Editor에서 한 번 실행
-- 마이그레이션: migrations/20260827_security_hardening.sql 과 동일 내용 포함

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

-- 멤버 (PIN 해시만 저장)
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  cohort text not null,
  name text not null,
  pin_hash text not null,
  created_at timestamptz not null default now(),
  constraint members_cohort_check check (cohort ~ '^\d{1,2}$'),
  constraint members_name_len check (char_length(name) between 1 and 100),
  constraint members_unique unique (cohort, name)
);

create table if not exists sessions (
  token uuid primary key default gen_random_uuid(),
  cohort text not null,
  name text not null,
  device_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint sessions_cohort_check check (cohort ~ '^\d{1,2}$'),
  constraint sessions_name_len check (char_length(name) between 1 and 100)
);

create index if not exists sessions_expires_idx on sessions (expires_at);

create table if not exists login_attempts (
  id bigserial primary key,
  ip text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists login_attempts_ip_at_idx on login_attempts (ip, attempted_at desc);

create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  device_id text unique not null,
  cohort text not null,
  name text not null,
  last_ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint devices_cohort_check check (cohort ~ '^\d{1,2}$'),
  constraint devices_name_len check (char_length(name) <= 100)
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
    ),
  constraint rehearsals_time_format_check
    check (start_time ~ '^\d{2}:\d{2}$' and end_time ~ '^\d{2}:\d{2}$'),
  constraint rehearsals_time_order_check
    check (public.hhmm_to_minutes(end_time) > public.hhmm_to_minutes(start_time)),
  constraint rehearsals_team_name_len check (char_length(team_name) <= 100),
  constraint rehearsals_cohort_check check (created_by_cohort ~ '^\d{1,2}$'),
  constraint rehearsals_name_len check (char_length(created_by_name) <= 100)
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
  device_id text,
  constraint activity_logs_summary_len check (char_length(summary) <= 200)
);

create index if not exists rehearsals_date_idx on rehearsals (date);
create index if not exists activity_logs_at_idx on activity_logs (at desc);
create index if not exists devices_last_seen_idx on devices (last_seen_at desc);

alter table members enable row level security;
alter table sessions enable row level security;
alter table login_attempts enable row level security;
alter table devices enable row level security;
alter table rehearsals enable row level security;
alter table activity_logs enable row level security;

drop policy if exists "public read write devices" on devices;
drop policy if exists "public read write rehearsals" on rehearsals;
drop policy if exists "public read write activity_logs" on activity_logs;
drop policy if exists "anon read rehearsals" on rehearsals;
drop policy if exists "anon read activity_logs" on activity_logs;

create policy "anon read rehearsals"
  on rehearsals for select to anon, authenticated using (true);

create policy "anon read activity_logs"
  on activity_logs for select to anon, authenticated using (true);

-- 이하 RPC/트리거: migrations/20260827_security_hardening.sql 실행으로 적용
-- 멤버 등록: SELECT admin_set_member_pin('12', '김태조', '1234');
