-- 로그인 rate limit: device / name / ip 다중 버킷
-- Supabase SQL Editor에서 실행

alter table login_attempts
  add column if not exists attempt_key text;

update login_attempts
set attempt_key = coalesce(nullif(trim(ip), ''), 'unknown')
where attempt_key is null;

alter table login_attempts
  alter column attempt_key set default 'unknown';

do $$
begin
  alter table login_attempts alter column attempt_key set not null;
exception
  when others then null;
end $$;

create index if not exists login_attempts_key_at_idx
  on login_attempts (attempt_key, attempted_at desc);

create or replace function public.login_attempt_keys(
  p_device_id text,
  p_name text,
  p_ip text default null
)
returns text[]
language sql
immutable
as $$
  select array_remove(array[
    case when nullif(trim(p_device_id), '') is not null
      then 'device:' || trim(p_device_id) end,
    case when nullif(trim(p_name), '') is not null
      then 'name:' || lower(trim(p_name)) end,
    case when nullif(trim(p_ip), '') is not null
      then 'ip:' || trim(p_ip) end
  ], null);
$$;

create or replace function public.assert_login_not_rate_limited(p_keys text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_keys text[] := coalesce(p_keys, array[]::text[]);
begin
  if coalesce(array_length(v_keys, 1), 0) = 0 then
    v_keys := array['unknown'];
  end if;

  delete from login_attempts where attempted_at < now() - interval '1 hour';

  select count(*)::integer into v_count
  from login_attempts
  where attempt_key = any (v_keys)
    and attempted_at > now() - interval '5 minutes';

  if v_count >= 10 then
    raise exception '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  end if;
end;
$$;

-- 구 시그니처 유지 (단일 키 → 배열 래퍼)
create or replace function public.assert_login_not_rate_limited(p_ip text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_login_not_rate_limited(
    array[coalesce(nullif(trim(p_ip), ''), 'unknown')]
  );
end;
$$;

create or replace function public.record_login_failure(p_keys text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_keys text[] := coalesce(p_keys, array[]::text[]);
begin
  if coalesce(array_length(v_keys, 1), 0) = 0 then
    v_keys := array['unknown'];
  end if;
  foreach v_key in array v_keys loop
    insert into login_attempts (ip, attempt_key)
    values (left(v_key, 200), v_key);
  end loop;
end;
$$;

create or replace function public.record_login_failure(p_ip text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.record_login_failure(
    array[coalesce(nullif(trim(p_ip), ''), 'unknown')]
  );
end;
$$;

create or replace function public.clear_login_attempts(p_keys text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keys text[] := coalesce(p_keys, array[]::text[]);
begin
  if coalesce(array_length(v_keys, 1), 0) = 0 then
    return;
  end if;
  delete from login_attempts where attempt_key = any (v_keys);
end;
$$;

create or replace function public.clear_login_attempts(p_ip text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.clear_login_attempts(
    array[coalesce(nullif(trim(p_ip), ''), 'unknown')]
  );
end;
$$;

-- login / signup: device+name(+ip) 버킷 사용
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
