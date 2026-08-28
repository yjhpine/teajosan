-- 관리자: 점검 모드에서도 접속·작업 가능
-- Supabase SQL Editor에서 실행 (maintenance_mode.sql 적용 후)

alter table members
  add column if not exists is_admin boolean not null default false;

update members
set is_admin = true
where cohort = '46' and name = '양정환';

create or replace function public.is_admin_member(p_cohort text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select m.is_admin
      from members m
      where m.cohort = trim(p_cohort)
        and m.name = trim(p_name)
    ),
    false
  );
$$;

create or replace function public.assert_maintenance_open(
  p_cohort text default null,
  p_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_message text;
begin
  if p_cohort is not null
    and p_name is not null
    and public.is_admin_member(p_cohort, p_name)
  then
    return;
  end if;

  select maintenance_enabled, maintenance_message
  into v_enabled, v_message
  from app_settings
  where id = 'default';

  if coalesce(v_enabled, false) then
    raise exception '%', coalesce(nullif(trim(v_message), ''), '지금은 점검 중입니다. 잠시 후 다시 접속해 주세요.');
  end if;
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

  perform public.assert_maintenance_open(v_cohort, v_name);

  cohort := v_cohort;
  name := v_name;
  device_id := v_device_id;
  return next;
end;
$$;

create or replace function public.validate_session(p_token uuid)
returns table (cohort text, name text, expires_at timestamptz, is_admin boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cohort text;
  v_name text;
  v_expires timestamptz;
  v_is_admin boolean;
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

  v_is_admin := public.is_admin_member(v_cohort, v_name);
  perform public.assert_maintenance_open(v_cohort, v_name);

  cohort := v_cohort;
  name := v_name;
  expires_at := v_expires;
  is_admin := v_is_admin;
  return next;
end;
$$;

create or replace function public.get_my_profile(p_token uuid)
returns table (cohort text, name text, sessions text[], is_admin boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_cohort text;
  v_name text;
  v_sessions text[];
  v_is_admin boolean;
begin
  select s.cohort, s.name into v_cohort, v_name
  from public.assert_valid_session(p_token) s;

  select m.sessions, m.is_admin
  into v_sessions, v_is_admin
  from public.members m
  where m.cohort = v_cohort and m.name = v_name;

  if v_sessions is null then
    raise exception '멤버를 찾을 수 없습니다.';
  end if;

  return query select v_cohort, v_name, v_sessions, coalesce(v_is_admin, false);
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

  perform public.assert_maintenance_open(v_cohort, v_name);

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

grant execute on function public.is_admin_member(text, text) to anon, authenticated;
