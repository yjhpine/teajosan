-- set_my_sessions / get_my_profile: name 컬럼 ambiguous 수정
-- SQL Editor에서 실행

create or replace function public.get_my_profile(p_token uuid)
returns table (cohort text, name text, sessions text[])
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_cohort text;
  v_name text;
  v_sessions text[];
begin
  select s.cohort, s.name into v_cohort, v_name
  from public.assert_valid_session(p_token) s;

  select m.sessions into v_sessions
  from public.members m
  where m.cohort = v_cohort and m.name = v_name;

  if v_sessions is null then
    raise exception '멤버를 찾을 수 없습니다.';
  end if;

  return query select v_cohort, v_name, v_sessions;
end;
$$;

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
  v_sessions text[];
  v_allowed text[] := array['vocal','guitar','bass','drums','keyboard'];
begin
  select s.cohort, s.name into v_cohort, v_name
  from public.assert_valid_session(p_token) s;

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

  insert into public.band_roster as r (name)
  values (v_name)
  on conflict (name) do nothing;

  return query select v_cohort, v_name, v_sessions;
end;
$$;

grant execute on function public.get_my_profile(uuid) to anon, authenticated;
grant execute on function public.set_my_sessions(uuid, text[]) to anon, authenticated;
