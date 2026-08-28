-- create_song: 유튜브 URL 지원 (곡 리스트에서 직접 팀 생성)
-- Supabase SQL Editor에서 실행

drop function if exists public.create_song(uuid, text, text, text, text, text, text, text);

create or replace function public.create_song(
  p_session_token uuid,
  p_title text default '',
  p_vocal text default '',
  p_guitar1 text default '',
  p_guitar2 text default '',
  p_bass text default '',
  p_drums text default '',
  p_keyboard text default '',
  p_youtube_url text default ''
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
  v_order integer;
begin
  select s.cohort, s.name into v_cohort, v_name
  from public.assert_valid_session(p_session_token) s;

  select coalesce(max(sort_order), 0) + 10 into v_order from songs;

  insert into songs (
    title, vocal, guitar1, guitar2, bass, drums, keyboard, youtube_url,
    sort_order, created_by_cohort, created_by_name
  )
  values (
    left(coalesce(trim(p_title), ''), 120),
    left(coalesce(trim(p_vocal), ''), 40),
    left(coalesce(trim(p_guitar1), ''), 40),
    left(coalesce(trim(p_guitar2), ''), 40),
    left(coalesce(trim(p_bass), ''), 40),
    left(coalesce(trim(p_drums), ''), 40),
    left(coalesce(trim(p_keyboard), ''), 40),
    left(coalesce(trim(p_youtube_url), ''), 300),
    v_order, v_cohort, v_name
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_song(uuid, text, text, text, text, text, text, text, text) to anon, authenticated;
