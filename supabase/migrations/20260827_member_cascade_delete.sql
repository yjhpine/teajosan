-- 멤버 삭제 시 연관 데이터 자동 정리 (FK CASCADE + 곡 배정 트리거)
-- Supabase SQL Editor에서 실행
--
-- 이후 멤버 제거는 아래 한 줄이면 됩니다:
--   DELETE FROM members WHERE name = '이름';
--
-- 자동 처리:
--   sessions, devices, band_roster → FK ON DELETE CASCADE
--   songs (vocal/guitar/… 컬럼) → DELETE 트리거로 이름 비움
--   rehearsals, activity_logs → 과거 기록 보존 (텍스트로 남음)

-- ---------------------------------------------------------------------------
-- 1. member_id FK 컬럼 추가
-- ---------------------------------------------------------------------------

alter table sessions
  add column if not exists member_id uuid;

alter table devices
  add column if not exists member_id uuid;

alter table band_roster
  add column if not exists member_id uuid;

-- ---------------------------------------------------------------------------
-- 2. 기존 데이터 member_id 백필
-- ---------------------------------------------------------------------------

update sessions s
set member_id = m.id
from members m
where s.member_id is null
  and s.name = m.name
  and s.cohort = m.cohort;

update devices d
set member_id = m.id
from members m
where d.member_id is null
  and d.name = m.name
  and d.cohort = m.cohort;

update band_roster br
set member_id = m.id
from members m
where br.member_id is null
  and br.name = m.name;

-- ---------------------------------------------------------------------------
-- 3. FK 제약 (멤버 삭제 시 CASCADE)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_member_id_fkey') then
    alter table sessions
      add constraint sessions_member_id_fkey
      foreign key (member_id) references members (id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'devices_member_id_fkey') then
    alter table devices
      add constraint devices_member_id_fkey
      foreign key (member_id) references members (id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'band_roster_member_id_fkey') then
    alter table band_roster
      add constraint band_roster_member_id_fkey
      foreign key (member_id) references members (id) on delete cascade;
  end if;
end $$;

create index if not exists sessions_member_id_idx on sessions (member_id);
create index if not exists devices_member_id_idx on devices (member_id);
create index if not exists band_roster_member_id_idx on band_roster (member_id);

-- ---------------------------------------------------------------------------
-- 4. 곡 배정(텍스트 컬럼) 자동 비우기
-- ---------------------------------------------------------------------------

create or replace function public.clear_member_from_songs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update songs set vocal = '' where vocal = old.name;
  update songs set guitar1 = '' where guitar1 = old.name;
  update songs set guitar2 = '' where guitar2 = old.name;
  update songs set bass = '' where bass = old.name;
  update songs set drums = '' where drums = old.name;
  update songs set keyboard = '' where keyboard = old.name;
  return old;
end;
$$;

drop trigger if exists member_deleted_clear_songs on members;

create trigger member_deleted_clear_songs
  before delete on members
  for each row
  execute function public.clear_member_from_songs();

-- ---------------------------------------------------------------------------
-- 5. login / signup — member_id 기록
-- ---------------------------------------------------------------------------

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

  select m.id, m.cohort, m.pin_hash
  into v_member_id, v_cohort, v_pin_hash
  from members m
  where m.name = v_name;

  if v_pin_hash is null or crypt(p_pin, v_pin_hash) <> v_pin_hash then
    perform public.record_login_failure(p_client_ip);
    raise exception '이름 또는 PIN이 올바르지 않습니다.';
  end if;

  perform public.clear_login_attempts(p_client_ip);

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
  values (v_cohort, v_name, crypt(p_pin, gen_salt('bf')), v_sessions)
  returning id into v_member_id;

  insert into band_roster (name, member_id)
  values (v_name, v_member_id)
  on conflict (name) do update
  set member_id = excluded.member_id
  where band_roster.member_id is null;

  perform public.clear_login_attempts(p_client_ip);

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

-- set_my_sessions — band_roster member_id 연동
create or replace function public.set_my_sessions(
  p_token uuid,
  p_sessions text[]
)
returns table (cohort text, name text, sessions text[])
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_cohort text;
  v_name text;
  v_member_id uuid;
  v_sessions text[];
  v_allowed text[] := array['vocal','guitar','bass','drums','keyboard'];
begin
  select s.cohort, s.name into v_cohort, v_name
  from public.assert_valid_session(p_token) s;

  select m.id into v_member_id
  from public.members m
  where m.cohort = v_cohort and m.name = v_name;

  if p_sessions is null or coalesce(array_length(p_sessions, 1), 0) = 0 then
    raise exception '세션을 하나 이상 선택해 주세요.';
  end if;

  if not (p_sessions <@ v_allowed) then
    raise exception '허용되지 않은 세션이 포함되어 있습니다.';
  end if;

  select array(select distinct unnest(p_sessions) order by 1) into v_sessions;

  update public.members m
  set sessions = v_sessions
  where m.cohort = v_cohort and m.name = v_name;

  if not found then
    raise exception '멤버를 찾을 수 없습니다.';
  end if;

  insert into public.band_roster (name, member_id)
  values (v_name, v_member_id)
  on conflict (name) do update
  set member_id = excluded.member_id
  where band_roster.member_id is null;

  return query select v_cohort, v_name, v_sessions;
end;
$$;

grant execute on function public.login(text, text, text, text) to anon, authenticated;
grant execute on function public.signup(text, text, text, text[], text, text) to anon, authenticated;
grant execute on function public.set_my_sessions(uuid, text[]) to anon, authenticated;
