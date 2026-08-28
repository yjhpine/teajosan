-- 점검(유지보수) 모드: 프론트/백 작업 중 사용자 접속 차단
-- Supabase SQL Editor에서 실행

create table if not exists app_settings (
  id text primary key default 'default',
  maintenance_enabled boolean not null default false,
  maintenance_message text not null default '지금은 점검 중입니다. 잠시 후 다시 접속해 주세요.',
  updated_at timestamptz not null default now(),
  constraint app_settings_id_check check (id = 'default'),
  constraint app_settings_message_len check (char_length(maintenance_message) <= 500)
);

insert into app_settings (id, maintenance_enabled, maintenance_message)
values ('default', false, '지금은 점검 중입니다. 잠시 후 다시 접속해 주세요.')
on conflict (id) do nothing;

alter table app_settings enable row level security;

drop policy if exists "anon read app_settings" on app_settings;
create policy "anon read app_settings"
  on app_settings for select to anon, authenticated using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_settings'
  ) then
    alter publication supabase_realtime add table public.app_settings;
  end if;
end $$;

create or replace function public.assert_maintenance_open()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_message text;
begin
  select maintenance_enabled, maintenance_message
  into v_enabled, v_message
  from app_settings
  where id = 'default';

  if coalesce(v_enabled, false) then
    raise exception '%', coalesce(nullif(trim(v_message), ''), '지금은 점검 중입니다. 잠시 후 다시 접속해 주세요.');
  end if;
end;
$$;

create or replace function public.get_app_status()
returns table (maintenance_enabled boolean, maintenance_message text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select s.maintenance_enabled, s.maintenance_message
  from app_settings s
  where s.id = 'default';
end;
$$;

grant execute on function public.get_app_status() to anon, authenticated;

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
  perform public.assert_maintenance_open();

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
  perform public.assert_maintenance_open();

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

create or replace function public.login(
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
#variable_conflict use_column
declare
  v_name text := trim(p_name);
  v_member_id uuid;
  v_cohort text;
  v_pin_hash text;
  v_token uuid;
  v_keys text[];
begin
  perform public.assert_maintenance_open();

  if v_name is null or v_name = '' then
    raise exception '이름을 입력해 주세요.';
  end if;
  if p_pin is null or char_length(p_pin) < 4 then
    raise exception 'PIN은 4자 이상이어야 합니다.';
  end if;
  if p_device_id is null or trim(p_device_id) = '' then
    raise exception '기기 정보가 없습니다.';
  end if;

  v_keys := public.login_attempt_keys(p_device_id, v_name, p_client_ip);
  perform public.assert_login_not_rate_limited(v_keys);

  select m.id, m.cohort, m.pin_hash
  into v_member_id, v_cohort, v_pin_hash
  from members m
  where m.name = v_name;

  if v_pin_hash is null or crypt(p_pin, v_pin_hash) <> v_pin_hash then
    perform public.record_login_failure(v_keys);
    raise exception '이름 또는 PIN이 올바르지 않습니다.';
  end if;

  perform public.clear_login_attempts(v_keys);

  v_token := gen_random_uuid();

  insert into sessions (token, cohort, name, device_id, expires_at, member_id)
  values (v_token, v_cohort, v_name, trim(p_device_id), now() + interval '90 days', v_member_id);

  insert into devices (device_id, cohort, name, last_ip, last_seen_at, member_id)
  values (trim(p_device_id), v_cohort, v_name, nullif(trim(p_client_ip), ''), now(), v_member_id)
  on conflict (device_id) do update
  set cohort = excluded.cohort,
      name = excluded.name,
      last_ip = coalesce(excluded.last_ip, devices.last_ip),
      last_seen_at = excluded.last_seen_at,
      member_id = excluded.member_id;

  return v_token;
end;
$$;

create or replace function public.signup(
  p_cohort text,
  p_name text,
  p_pin text,
  p_sessions text[],
  p_device_id text,
  p_client_ip text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_cohort text := trim(p_cohort);
  v_name text := trim(p_name);
  v_member_id uuid;
  v_sessions text[];
  v_allowed text[] := array['vocal','guitar','bass','drums','keyboard'];
  v_token uuid;
  v_keys text[];
begin
  perform public.assert_maintenance_open();

  if v_cohort is null or v_cohort !~ '^\d{1,2}$' then
    raise exception '기수는 숫자로 입력해 주세요. 예: 12';
  end if;
  if v_name is null or v_name = '' or char_length(v_name) > 100 then
    raise exception '이름을 입력해 주세요.';
  end if;
  if p_pin is null or char_length(p_pin) < 4 then
    raise exception 'PIN은 4자 이상이어야 합니다.';
  end if;
  if p_device_id is null or trim(p_device_id) = '' then
    raise exception '기기 정보가 없습니다.';
  end if;
  if p_sessions is null or coalesce(array_length(p_sessions, 1), 0) = 0 then
    raise exception '세션을 하나 이상 선택해 주세요.';
  end if;
  if not (p_sessions <@ v_allowed) then
    raise exception '허용되지 않은 세션이 포함되어 있습니다.';
  end if;

  v_keys := public.login_attempt_keys(p_device_id, v_name, p_client_ip);
  perform public.assert_login_not_rate_limited(v_keys);

  if exists (
    select 1 from members m
    where m.cohort = v_cohort and m.name = v_name
  ) then
    perform public.record_login_failure(v_keys);
    raise exception '이미 가입된 기수·이름입니다. 로그인 탭에서 입장해 주세요.';
  end if;

  if exists (
    select 1 from members m
    where m.name = v_name and m.cohort <> v_cohort
  ) then
    perform public.record_login_failure(v_keys);
    raise exception '이미 다른 기수로 가입된 이름입니다.';
  end if;

  select array(select distinct unnest(p_sessions) order by 1) into v_sessions;

  begin
    insert into members (cohort, name, pin_hash, sessions)
    values (v_cohort, v_name, crypt(p_pin, gen_salt('bf')), v_sessions)
    returning id into v_member_id;
  exception
    when unique_violation then
      perform public.record_login_failure(v_keys);
      raise exception '이미 가입된 기수·이름입니다. 로그인 탭에서 입장해 주세요.';
  end;

  insert into band_roster (name, member_id)
  values (v_name, v_member_id)
  on conflict (name) do update
  set member_id = excluded.member_id
  where band_roster.member_id is null;

  perform public.clear_login_attempts(v_keys);

  v_token := gen_random_uuid();

  insert into sessions (token, cohort, name, device_id, expires_at, member_id)
  values (v_token, v_cohort, v_name, trim(p_device_id), now() + interval '90 days', v_member_id);

  insert into devices (device_id, cohort, name, last_ip, last_seen_at, member_id)
  values (trim(p_device_id), v_cohort, v_name, nullif(trim(p_client_ip), ''), now(), v_member_id)
  on conflict (device_id) do update
  set cohort = excluded.cohort,
      name = excluded.name,
      last_ip = coalesce(excluded.last_ip, devices.last_ip),
      last_seen_at = excluded.last_seen_at,
      member_id = excluded.member_id;

  return v_token;
end;
$$;

grant execute on function public.login(text, text, text, text) to anon, authenticated;
grant execute on function public.signup(text, text, text, text[], text, text) to anon, authenticated;
