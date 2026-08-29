-- 가입 시 "function public.assert_maintenance_open() is not unique" 즉시 수정
-- (점검 모드 ON/OFF와 무관 — DB 함수 중복 문제)
-- migrations/20260829_fix_assert_maintenance_open_unique.sql 과 동일

drop function if exists public.assert_maintenance_open();

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
  perform public.assert_maintenance_open(v_cohort, v_name);

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

grant execute on function public.signup(text, text, text, text[], text, text) to anon, authenticated;

-- 점검 모드가 켜져 있으면 끄기
update app_settings
set maintenance_enabled = false,
    updated_at = now()
where id = 'default';

-- 확인: assert_maintenance_open 오버로드 1개만 남아야 함
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'assert_maintenance_open';

select maintenance_enabled, maintenance_message, updated_at
from app_settings
where id = 'default';
