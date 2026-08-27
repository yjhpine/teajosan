-- pgcrypto는 Supabase에서 extensions 스키마에 있음
-- SQL Editor에서 이 파일만 실행한 뒤 seed_member_pins.sql 재실행

create extension if not exists pgcrypto with schema extensions;

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

grant execute on function public.login(text, text, text, text, text) to anon, authenticated;
-- admin_set_member_pin은 anon에 GRANT 하지 않음 (SQL Editor / service role만)
