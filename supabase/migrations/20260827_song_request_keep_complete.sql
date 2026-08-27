-- 완성된 곡 신청: 곡 리스트로 이관하되 신청 목록에는 남김
-- Supabase SQL Editor에서 실행

alter table song_requests
  add column if not exists promoted_at timestamptz;

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

  -- 이미 이관된 신청은 삭제하지 않고 그대로 둠
  if r.promoted_at is not null then
    return null;
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
begin
  select s.name into v_name
  from public.assert_valid_session(p_session_token) s;

  if p_slot not in ('vocal', 'guitar1', 'guitar2', 'bass', 'drums', 'keyboard') then
    raise exception '잘못된 세션입니다.';
  end if;

  select needed_slots, promoted_at
  into v_needed, v_promoted
  from song_requests
  where id = p_id
  for update;

  if not found then
    raise exception '신청글을 찾을 수 없습니다.';
  end if;

  if v_promoted is not null then
    raise exception '완성된 신청은 변경할 수 없습니다.';
  end if;

  -- 이미 완성인데 이관만 안 된 경우: 이관 후 변경 차단
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

  if public.song_request_is_complete(p_id) then
    perform public.promote_song_request(p_session_token, p_id);
  end if;
end;
$$;

-- create 시 완성(내 세션만으로 전원 채움)도 이관만 하고 신청글은 유지
-- (기존 create_song_request 본문은 youtube 마이그레이션과 동일, promote만 유지)

grant execute on function public.claim_song_request_slot(uuid, uuid, text) to anon, authenticated;
grant execute on function public.promote_song_request(uuid, uuid) to anon, authenticated;
