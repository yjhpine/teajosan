-- 공연 시작 시간
-- Supabase SQL Editor에서 실행

alter table performances
  add column if not exists start_time text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'performances_start_time_format'
  ) then
    alter table performances
      add constraint performances_start_time_format
      check (start_time = '' or start_time ~ '^\d{2}:\d{2}$');
  end if;
end $$;

drop function if exists public.create_performance(uuid, text, date, text, text, uuid[]);
drop function if exists public.update_performance(uuid, uuid, text, date, text, text, uuid[]);

create or replace function public.create_performance(
  p_session_token uuid,
  p_title text,
  p_performance_date date,
  p_start_time text default '',
  p_place text default '',
  p_note text default '',
  p_song_ids uuid[] default '{}'
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
  v_title text := left(trim(coalesce(p_title, '')), 120);
  v_start_time text := trim(coalesce(p_start_time, ''));
  v_place text := left(trim(coalesce(p_place, '')), 120);
  v_note text := left(trim(coalesce(p_note, '')), 500);
begin
  select s.cohort, s.name into v_cohort, v_name
  from public.assert_valid_session(p_session_token) s;

  if v_title = '' then
    raise exception '공연 이름을 입력해 주세요.';
  end if;

  if p_performance_date is null then
    raise exception '공연 날짜를 선택해 주세요.';
  end if;

  if v_start_time <> '' and v_start_time !~ '^\d{2}:\d{2}$' then
    raise exception '시작 시간 형식이 올바르지 않습니다. 예: 19:00';
  end if;

  insert into performances (
    title, performance_date, start_time, place, note,
    created_by_cohort, created_by_name
  )
  values (
    v_title, p_performance_date, v_start_time, v_place, v_note,
    v_cohort, v_name
  )
  returning id into v_id;

  perform public.set_performance_songs(v_id, p_song_ids);
  return v_id;
end;
$$;

create or replace function public.update_performance(
  p_session_token uuid,
  p_id uuid,
  p_title text,
  p_performance_date date,
  p_start_time text default '',
  p_place text default '',
  p_note text default '',
  p_song_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := left(trim(coalesce(p_title, '')), 120);
  v_start_time text := trim(coalesce(p_start_time, ''));
  v_place text := left(trim(coalesce(p_place, '')), 120);
  v_note text := left(trim(coalesce(p_note, '')), 500);
  v_updated integer;
begin
  perform public.assert_valid_session(p_session_token);

  if v_title = '' then
    raise exception '공연 이름을 입력해 주세요.';
  end if;

  if p_performance_date is null then
    raise exception '공연 날짜를 선택해 주세요.';
  end if;

  if v_start_time <> '' and v_start_time !~ '^\d{2}:\d{2}$' then
    raise exception '시작 시간 형식이 올바르지 않습니다. 예: 19:00';
  end if;

  update performances
  set title = v_title,
      performance_date = p_performance_date,
      start_time = v_start_time,
      place = v_place,
      note = v_note,
      updated_at = now()
  where id = p_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception '공연을 찾을 수 없습니다.';
  end if;

  perform public.set_performance_songs(p_id, p_song_ids);
end;
$$;

grant execute on function public.create_performance(uuid, text, date, text, text, text, uuid[]) to anon, authenticated;
grant execute on function public.update_performance(uuid, uuid, text, date, text, text, text, uuid[]) to anon, authenticated;
