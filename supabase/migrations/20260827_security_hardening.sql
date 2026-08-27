-- 보안 강화: 멤버별 PIN + 세션 RPC + RLS + 활동로그 트리거
-- Supabase SQL Editor에서 한 번 실행
--
-- 멤버 등록 예시 (SQL Editor):
--   INSERT INTO members (cohort, name, pin_hash)
--   VALUES ('12', '김태조', extensions.crypt('1234', extensions.gen_salt('bf')))
--   ON CONFLICT (cohort, name) DO UPDATE SET pin_hash = EXCLUDED.pin_hash;

-- ---------------------------------------------------------------------------
-- 1. 보조 테이블
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 2. 기존 테이블 CHECK 제약 (이미 있으면 무시)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rehearsals_time_format_check') then
    alter table rehearsals
      add constraint rehearsals_time_format_check
      check (start_time ~ '^\d{2}:\d{2}$' and end_time ~ '^\d{2}:\d{2}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'rehearsals_time_order_check') then
    alter table rehearsals
      add constraint rehearsals_time_order_check
      check (public.hhmm_to_minutes(end_time) > public.hhmm_to_minutes(start_time));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'rehearsals_team_name_len') then
    alter table rehearsals
      add constraint rehearsals_team_name_len check (char_length(team_name) <= 100);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'rehearsals_cohort_check') then
    alter table rehearsals
      add constraint rehearsals_cohort_check
      check (created_by_cohort ~ '^\d{1,2}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'rehearsals_name_len') then
    alter table rehearsals
      add constraint rehearsals_name_len check (char_length(created_by_name) <= 100);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'activity_logs_summary_len') then
    alter table activity_logs
      add constraint activity_logs_summary_len check (char_length(summary) <= 200);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'devices_cohort_check') then
    alter table devices
      add constraint devices_cohort_check check (cohort ~ '^\d{1,2}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'devices_name_len') then
    alter table devices
      add constraint devices_name_len check (char_length(name) <= 100);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. RLS 교체
-- ---------------------------------------------------------------------------

alter table members enable row level security;
alter table sessions enable row level security;
alter table login_attempts enable row level security;

drop policy if exists "public read write devices" on devices;
drop policy if exists "public read write rehearsals" on rehearsals;
drop policy if exists "public read write activity_logs" on activity_logs;

create policy "anon read rehearsals"
  on rehearsals for select to anon, authenticated
  using (true);

create policy "anon read activity_logs"
  on activity_logs for select to anon, authenticated
  using (true);

-- devices / sessions / members / login_attempts: anon 정책 없음 → 기본 거부

-- ---------------------------------------------------------------------------
-- 4. 활동 로그 트리거 (직접 insert 금지, 트리거만 기록)
-- ---------------------------------------------------------------------------

create or replace function public.rehearsal_summary_label(
  p_cohort text,
  p_name text,
  p_date date,
  p_team_name text,
  p_action text
)
returns text
language sql
immutable
as $$
  select trim(p_cohort) || '기 ' || trim(p_name) || ' · ' || p_date::text || ' '
       || coalesce(nullif(trim(p_team_name), ''), '합주') || ' ' || p_action;
$$;

create or replace function public.log_rehearsal_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into activity_logs (actor_cohort, actor_name, action, summary, rehearsal_id)
    values (
      new.created_by_cohort,
      new.created_by_name,
      'create',
      public.rehearsal_summary_label(new.created_by_cohort, new.created_by_name, new.date, new.team_name, '등록'),
      new.id
    );
    return new;
  elsif tg_op = 'DELETE' then
    insert into activity_logs (actor_cohort, actor_name, action, summary, rehearsal_id)
    values (
      old.created_by_cohort,
      old.created_by_name,
      'delete',
      public.rehearsal_summary_label(old.created_by_cohort, old.created_by_name, old.date, old.team_name, '삭제'),
      null
    );
    return old;
  elsif tg_op = 'UPDATE' then
    insert into activity_logs (actor_cohort, actor_name, action, summary, rehearsal_id)
    values (
      coalesce(new.updated_by_cohort, new.created_by_cohort),
      coalesce(new.updated_by_name, new.created_by_name),
      'update',
      public.rehearsal_summary_label(
        coalesce(new.updated_by_cohort, new.created_by_cohort),
        coalesce(new.updated_by_name, new.created_by_name),
        new.date,
        new.team_name,
        '수정'
      ),
      new.id
    );
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists rehearsals_activity_log on rehearsals;
create trigger rehearsals_activity_log
  after insert or update or delete on rehearsals
  for each row execute function public.log_rehearsal_changes();

-- ---------------------------------------------------------------------------
-- 5. 내부 헬퍼
-- ---------------------------------------------------------------------------

create or replace function public.assert_login_not_rate_limited(p_ip text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := coalesce(nullif(trim(p_ip), ''), 'unknown');
  v_count integer;
begin
  delete from login_attempts where attempted_at < now() - interval '1 hour';

  select count(*)::integer into v_count
  from login_attempts
  where ip = v_key
    and attempted_at > now() - interval '5 minutes';

  if v_count >= 10 then
    raise exception '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  end if;
end;
$$;

create or replace function public.record_login_failure(p_ip text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into login_attempts (ip)
  values (coalesce(nullif(trim(p_ip), ''), 'unknown'));
end;
$$;

create or replace function public.clear_login_attempts(p_ip text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from login_attempts
  where ip = coalesce(nullif(trim(p_ip), ''), 'unknown');
end;
$$;

create or replace function public.assert_valid_session(p_token uuid)
returns table (cohort text, name text, device_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cohort text;
  v_name text;
  v_device_id text;
begin
  if p_token is null then
    raise exception '세션이 없습니다. 다시 로그인해 주세요.';
  end if;

  update sessions s
  set expires_at = now() + interval '90 days'
  where s.token = p_token
    and s.expires_at > now()
  returning s.cohort, s.name, s.device_id
  into v_cohort, v_name, v_device_id;

  if v_cohort is null then
    raise exception '세션이 만료되었습니다. 다시 로그인해 주세요.';
  end if;

  cohort := v_cohort;
  name := v_name;
  device_id := v_device_id;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. RPC (anon 실행 허용)
-- ---------------------------------------------------------------------------

create or replace function public.login(
  p_cohort text,
  p_name text,
  p_pin text,
  p_device_id text,
  p_client_ip text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cohort text := trim(p_cohort);
  v_name text := trim(p_name);
  v_pin_hash text;
  v_token uuid;
begin
  if v_cohort is null or v_cohort = '' or v_name is null or v_name = '' then
    raise exception '기수와 이름을 입력해 주세요.';
  end if;
  if p_pin is null or char_length(p_pin) < 4 then
    raise exception 'PIN은 4자 이상이어야 합니다.';
  end if;
  if p_device_id is null or trim(p_device_id) = '' then
    raise exception '기기 정보가 없습니다.';
  end if;

  perform public.assert_login_not_rate_limited(p_client_ip);

  select m.pin_hash into v_pin_hash
  from members m
  where m.cohort = v_cohort and m.name = v_name;

  if v_pin_hash is null or crypt(p_pin, v_pin_hash) <> v_pin_hash then
    perform public.record_login_failure(p_client_ip);
    raise exception '기수, 이름 또는 PIN이 올바르지 않습니다.';
  end if;

  perform public.clear_login_attempts(p_client_ip);

  v_token := gen_random_uuid();

  insert into sessions (token, cohort, name, device_id, expires_at)
  values (v_token, v_cohort, v_name, trim(p_device_id), now() + interval '90 days');

  insert into devices (device_id, cohort, name, last_ip, last_seen_at)
  values (trim(p_device_id), v_cohort, v_name, nullif(trim(p_client_ip), ''), now())
  on conflict (device_id) do update
  set cohort = excluded.cohort,
      name = excluded.name,
      last_ip = coalesce(excluded.last_ip, devices.last_ip),
      last_seen_at = excluded.last_seen_at;

  return v_token;
end;
$$;

create or replace function public.validate_session(p_token uuid)
returns table (cohort text, name text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cohort text;
  v_name text;
  v_expires timestamptz;
begin
  if p_token is null then
    raise exception '세션이 없습니다. 다시 로그인해 주세요.';
  end if;

  update sessions s
  set expires_at = now() + interval '90 days'
  where s.token = p_token
    and s.expires_at > now()
  returning s.cohort, s.name, s.expires_at
  into v_cohort, v_name, v_expires;

  if v_cohort is null then
    raise exception '세션이 만료되었습니다. 다시 로그인해 주세요.';
  end if;

  cohort := v_cohort;
  name := v_name;
  expires_at := v_expires;
  return next;
end;
$$;

create or replace function public.logout(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from sessions where token = p_token;
end;
$$;

create or replace function public.touch_device(
  p_token uuid,
  p_client_ip text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cohort text;
  v_name text;
  v_device_id text;
begin
  select s.cohort, s.name, s.device_id
  into v_cohort, v_name, v_device_id
  from public.assert_valid_session(p_token) s;

  insert into devices (device_id, cohort, name, last_ip, user_agent, last_seen_at)
  values (v_device_id, v_cohort, v_name, nullif(trim(p_client_ip), ''), nullif(trim(p_user_agent), ''), now())
  on conflict (device_id) do update
  set cohort = excluded.cohort,
      name = excluded.name,
      last_ip = coalesce(excluded.last_ip, devices.last_ip),
      user_agent = coalesce(excluded.user_agent, devices.user_agent),
      last_seen_at = excluded.last_seen_at;
end;
$$;

create or replace function public.create_rehearsal(
  p_session_token uuid,
  p_date date,
  p_start_time text,
  p_end_time text,
  p_team_name text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cohort text;
  v_name text;
  v_id uuid;
  v_team text := left(coalesce(trim(p_team_name), ''), 100);
begin
  select s.cohort, s.name into v_cohort, v_name
  from public.assert_valid_session(p_session_token) s;

  if p_start_time !~ '^\d{2}:\d{2}$' or p_end_time !~ '^\d{2}:\d{2}$' then
    raise exception '시간 형식이 올바르지 않습니다.';
  end if;
  if public.hhmm_to_minutes(p_end_time) <= public.hhmm_to_minutes(p_start_time) then
    raise exception '종료 시간은 시작 시간보다 뒤여야 합니다.';
  end if;

  insert into rehearsals (
    date, start_time, end_time, team_name,
    created_by_cohort, created_by_name
  )
  values (p_date, p_start_time, p_end_time, v_team, v_cohort, v_name)
  returning id into v_id;

  return v_id;
exception
  when exclusion_violation then
    raise exception '같은 시간대에 이미 다른 합주가 있어 등록할 수 없습니다.';
end;
$$;

create or replace function public.update_rehearsal(
  p_session_token uuid,
  p_id uuid,
  p_date date,
  p_start_time text,
  p_end_time text,
  p_team_name text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cohort text;
  v_name text;
  v_team text := left(coalesce(trim(p_team_name), ''), 100);
  v_updated integer;
begin
  select s.cohort, s.name into v_cohort, v_name
  from public.assert_valid_session(p_session_token) s;

  if p_start_time !~ '^\d{2}:\d{2}$' or p_end_time !~ '^\d{2}:\d{2}$' then
    raise exception '시간 형식이 올바르지 않습니다.';
  end if;
  if public.hhmm_to_minutes(p_end_time) <= public.hhmm_to_minutes(p_start_time) then
    raise exception '종료 시간은 시작 시간보다 뒤여야 합니다.';
  end if;

  update rehearsals r
  set date = p_date,
      start_time = p_start_time,
      end_time = p_end_time,
      team_name = v_team,
      updated_by_cohort = v_cohort,
      updated_by_name = v_name,
      updated_at = now()
  where r.id = p_id
    and r.created_by_cohort = v_cohort
    and r.created_by_name = v_name;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception '본인이 등록한 합주만 수정할 수 있습니다.';
  end if;
exception
  when exclusion_violation then
    raise exception '같은 시간대에 이미 다른 합주가 있어 등록할 수 없습니다.';
end;
$$;

create or replace function public.delete_rehearsal(
  p_session_token uuid,
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cohort text;
  v_name text;
  v_deleted integer;
begin
  select s.cohort, s.name into v_cohort, v_name
  from public.assert_valid_session(p_session_token) s;

  delete from rehearsals r
  where r.id = p_id
    and r.created_by_cohort = v_cohort
    and r.created_by_name = v_name;

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception '본인이 등록한 합주만 삭제할 수 있습니다.';
  end if;
end;
$$;

-- SQL Editor 전용: 멤버 PIN 등록/변경 (anon 호출 불가)
create or replace function public.admin_set_member_pin(
  p_cohort text,
  p_name text,
  p_pin text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if char_length(coalesce(p_pin, '')) < 4 then
    raise exception 'PIN은 4자 이상이어야 합니다.';
  end if;

  insert into members (cohort, name, pin_hash)
  values (trim(p_cohort), trim(p_name), crypt(p_pin, gen_salt('bf')))
  on conflict (cohort, name) do update
  set pin_hash = excluded.pin_hash;
end;
$$;

revoke all on function public.assert_login_not_rate_limited(text) from public;
revoke all on function public.record_login_failure(text) from public;
revoke all on function public.clear_login_attempts(text) from public;
revoke all on function public.assert_valid_session(uuid) from public;
revoke all on function public.rehearsal_summary_label(text, text, date, text, text) from public;
revoke all on function public.log_rehearsal_changes() from public;
revoke all on function public.admin_set_member_pin(text, text, text) from public;

grant execute on function public.login(text, text, text, text, text) to anon, authenticated;
grant execute on function public.validate_session(uuid) to anon, authenticated;
grant execute on function public.logout(uuid) to anon, authenticated;
grant execute on function public.touch_device(uuid, text, text) to anon, authenticated;
grant execute on function public.create_rehearsal(uuid, date, text, text, text) to anon, authenticated;
grant execute on function public.update_rehearsal(uuid, uuid, date, text, text, text) to anon, authenticated;
grant execute on function public.delete_rehearsal(uuid, uuid) to anon, authenticated;
