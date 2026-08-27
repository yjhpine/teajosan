-- 셀프 가입 + 이름/PIN 로그인
-- SQL Editor에서 앱 배포 전에 실행

-- 1) 이름 유니크 (동명이인 가입/로그인 충돌 방지)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'members_name_unique'
  ) then
    alter table members
      add constraint members_name_unique unique (name);
  end if;
end $$;

-- 2) 기존 login(cohort,name,pin,...) 제거 후 이름+PIN 버전으로 교체
drop function if exists public.login(text, text, text, text, text);

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
  v_cohort text;
  v_pin_hash text;
  v_token uuid;
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

  perform public.assert_login_not_rate_limited(p_client_ip);

  select m.cohort, m.pin_hash into v_cohort, v_pin_hash
  from members m
  where m.name = v_name;

  if v_pin_hash is null or crypt(p_pin, v_pin_hash) <> v_pin_hash then
    perform public.record_login_failure(p_client_ip);
    raise exception '이름 또는 PIN이 올바르지 않습니다.';
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

-- 3) 셀프 가입
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
  v_sessions text[];
  v_allowed text[] := array['vocal','guitar','bass','drums','keyboard'];
  v_token uuid;
begin
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

  perform public.assert_login_not_rate_limited(p_client_ip);

  if exists (select 1 from members m where m.name = v_name) then
    perform public.record_login_failure(p_client_ip);
    raise exception '이미 사용 중인 이름입니다.';
  end if;

  select array(select distinct unnest(p_sessions) order by 1) into v_sessions;

  insert into members (cohort, name, pin_hash, sessions)
  values (v_cohort, v_name, crypt(p_pin, gen_salt('bf')), v_sessions);

  insert into band_roster as r (name)
  values (v_name)
  on conflict (name) do nothing;

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

revoke all on function public.login(text, text, text, text) from public;
revoke all on function public.signup(text, text, text, text[], text, text) from public;

grant execute on function public.login(text, text, text, text) to anon, authenticated;
grant execute on function public.signup(text, text, text, text[], text, text) to anon, authenticated;
