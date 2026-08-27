-- 곡 리스트에서 세션을 비우면 연결된 신청글을 다시 모집 중으로 활성화
-- Supabase SQL Editor에서 실행
-- 선행: 20260827_song_request_delete_with_song.sql (promoted_song_id)

create or replace function public.promote_song_request(
  p_session_token uuid,
  p_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r song_requests%rowtype;
  v_song_id uuid;
  v_order integer;
begin
  perform public.assert_valid_session(p_session_token);

  select * into r from song_requests where id = p_id for update;
  if not found then
    raise exception '신청글을 찾을 수 없습니다.';
  end if;

  if not public.song_request_is_complete(p_id) then
    raise exception '아직 팀이 완성되지 않았습니다.';
  end if;

  -- 이미 이관·완성 상태면 그대로
  if r.promoted_at is not null and r.promoted_song_id is not null then
    return r.promoted_song_id;
  end if;

  -- 예전에 이관됐다가 재모집된 경우: 같은 곡을 갱신
  if r.promoted_song_id is not null then
    update songs
    set title = r.title,
        vocal = r.vocal,
        guitar1 = r.guitar1,
        guitar2 = r.guitar2,
        bass = r.bass,
        drums = r.drums,
        keyboard = r.keyboard,
        youtube_url = coalesce(r.youtube_url, youtube_url),
        updated_at = now()
    where id = r.promoted_song_id;

    if not found then
      -- 곡이 없어졌으면 새로 생성
      select coalesce(max(sort_order), 0) + 10 into v_order from songs;
      insert into songs (
        title, vocal, guitar1, guitar2, bass, drums, keyboard, youtube_url,
        sort_order, created_by_cohort, created_by_name
      )
      values (
        r.title, r.vocal, r.guitar1, r.guitar2, r.bass, r.drums, r.keyboard,
        coalesce(r.youtube_url, ''),
        v_order, r.created_by_cohort, r.created_by_name
      )
      returning id into v_song_id;

      update song_requests
      set promoted_at = now(),
          promoted_song_id = v_song_id,
          updated_at = now()
      where id = p_id;

      return v_song_id;
    end if;

    update song_requests
    set promoted_at = now(),
        updated_at = now()
    where id = p_id;

    return r.promoted_song_id;
  end if;

  select coalesce(max(sort_order), 0) + 10 into v_order from songs;

  insert into songs (
    title, vocal, guitar1, guitar2, bass, drums, keyboard, youtube_url,
    sort_order, created_by_cohort, created_by_name
  )
  values (
    r.title, r.vocal, r.guitar1, r.guitar2, r.bass, r.drums, r.keyboard,
    coalesce(r.youtube_url, ''),
    v_order, r.created_by_cohort, r.created_by_name
  )
  returning id into v_song_id;

  update song_requests
  set promoted_at = now(),
      promoted_song_id = v_song_id,
      updated_at = now()
  where id = p_id;

  return v_song_id;
end;
$$;

create or replace function public.claim_song_request_slot(
  p_session_token uuid,
  p_id uuid,
  p_slot text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_name text;
  v_current text;
  v_needed text[];
  v_promoted timestamptz;
  v_song_id uuid;
  r song_requests%rowtype;
begin
  select s.name into v_name
  from public.assert_valid_session(p_session_token) s;

  if p_slot not in ('vocal', 'guitar1', 'guitar2', 'bass', 'drums', 'keyboard') then
    raise exception '잘못된 세션입니다.';
  end if;

  select needed_slots, promoted_at, promoted_song_id
  into v_needed, v_promoted, v_song_id
  from song_requests
  where id = p_id
  for update;

  if not found then
    raise exception '신청글을 찾을 수 없습니다.';
  end if;

  if v_promoted is not null then
    raise exception '완성된 신청은 변경할 수 없습니다.';
  end if;

  if public.song_request_is_complete(p_id) then
    perform public.promote_song_request(p_session_token, p_id);
    raise exception '완성된 신청은 변경할 수 없습니다.';
  end if;

  if not (p_slot = any (coalesce(v_needed, '{}'))) then
    raise exception '이 신청에 없는 세션입니다.';
  end if;

  select case p_slot
    when 'vocal' then vocal
    when 'guitar1' then guitar1
    when 'guitar2' then guitar2
    when 'bass' then bass
    when 'drums' then drums
    when 'keyboard' then keyboard
  end
  into v_current
  from song_requests
  where id = p_id;

  if v_current is null or trim(v_current) = '' then
    update song_requests set
      vocal = case when p_slot = 'vocal' then v_name else vocal end,
      guitar1 = case when p_slot = 'guitar1' then v_name else guitar1 end,
      guitar2 = case when p_slot = 'guitar2' then v_name else guitar2 end,
      bass = case when p_slot = 'bass' then v_name else bass end,
      drums = case when p_slot = 'drums' then v_name else drums end,
      keyboard = case when p_slot = 'keyboard' then v_name else keyboard end,
      updated_at = now()
    where id = p_id;
  elsif v_current = v_name then
    update song_requests set
      vocal = case when p_slot = 'vocal' then '' else vocal end,
      guitar1 = case when p_slot = 'guitar1' then '' else guitar1 end,
      guitar2 = case when p_slot = 'guitar2' then '' else guitar2 end,
      bass = case when p_slot = 'bass' then '' else bass end,
      drums = case when p_slot = 'drums' then '' else drums end,
      keyboard = case when p_slot = 'keyboard' then '' else keyboard end,
      updated_at = now()
    where id = p_id;
  else
    raise exception '이미 다른 멤버가 신청한 세션입니다.';
  end if;

  -- 재모집 중이면 곡 리스트 세션도 같이 맞춤
  if v_song_id is not null then
    select * into r from song_requests where id = p_id;
    update songs
    set vocal = r.vocal,
        guitar1 = r.guitar1,
        guitar2 = r.guitar2,
        bass = r.bass,
        drums = r.drums,
        keyboard = r.keyboard,
        updated_at = now()
    where id = v_song_id;
  end if;

  if public.song_request_is_complete(p_id) then
    perform public.promote_song_request(p_session_token, p_id);
  end if;
end;
$$;

create or replace function public.update_song(
  p_session_token uuid,
  p_id uuid,
  p_title text default null,
  p_vocal text default null,
  p_guitar1 text default null,
  p_guitar2 text default null,
  p_bass text default null,
  p_drums text default null,
  p_keyboard text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  perform public.assert_valid_session(p_session_token);

  update songs s
  set title = coalesce(left(trim(p_title), 120), s.title),
      vocal = coalesce(left(trim(p_vocal), 40), s.vocal),
      guitar1 = coalesce(left(trim(p_guitar1), 40), s.guitar1),
      guitar2 = coalesce(left(trim(p_guitar2), 40), s.guitar2),
      bass = coalesce(left(trim(p_bass), 40), s.bass),
      drums = coalesce(left(trim(p_drums), 40), s.drums),
      keyboard = coalesce(left(trim(p_keyboard), 40), s.keyboard),
      updated_at = now()
  where s.id = p_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception '곡을 찾을 수 없습니다.';
  end if;

  -- 연결된 신청글에 세션 동기화
  update song_requests sr
  set title = s.title,
      vocal = s.vocal,
      guitar1 = s.guitar1,
      guitar2 = s.guitar2,
      bass = s.bass,
      drums = s.drums,
      keyboard = s.keyboard,
      updated_at = now()
  from songs s
  where sr.promoted_song_id = s.id
    and s.id = p_id;

  -- 필요 세션이 비면 다시 모집 중으로 (흐림 해제)
  update song_requests sr
  set promoted_at = null,
      updated_at = now()
  where sr.promoted_song_id = p_id
    and sr.promoted_at is not null
    and not public.song_request_is_complete(sr.id);

  -- 다시 전부 찼으면 완성 상태로
  update song_requests sr
  set promoted_at = coalesce(sr.promoted_at, now()),
      updated_at = now()
  where sr.promoted_song_id = p_id
    and public.song_request_is_complete(sr.id);
end;
$$;

grant execute on function public.promote_song_request(uuid, uuid) to anon, authenticated;
grant execute on function public.claim_song_request_slot(uuid, uuid, text) to anon, authenticated;
grant execute on function public.update_song(uuid, uuid, text, text, text, text, text, text, text) to anon, authenticated;
