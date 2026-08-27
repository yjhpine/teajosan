-- 곡 신청: 새 곡 자유입력 + 필요 세션 + 팀 완성 시 곡 리스트 이관
-- Supabase SQL Editor에서 실행

alter table song_requests
  add column if not exists needed_slots text[] not null default '{}';

-- 기존 글: 값이 있는 칸 + 빈 칸 전부 필요 세션으로 간주(6칸)
update song_requests
set needed_slots = array['vocal','guitar1','guitar2','bass','drums','keyboard']
where coalesce(array_length(needed_slots, 1), 0) = 0;

create or replace function public.song_request_is_complete(p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r song_requests%rowtype;
  v_slot text;
  v_val text;
begin
  select * into r from song_requests where id = p_id;
  if not found then
    return false;
  end if;
  if coalesce(array_length(r.needed_slots, 1), 0) = 0 then
    return false;
  end if;

  foreach v_slot in array r.needed_slots loop
    v_val := case v_slot
      when 'vocal' then r.vocal
      when 'guitar1' then r.guitar1
      when 'guitar2' then r.guitar2
      when 'bass' then r.bass
      when 'drums' then r.drums
      when 'keyboard' then r.keyboard
      else null
    end;
    if v_val is null or trim(v_val) = '' then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

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

  select coalesce(max(sort_order), 0) + 10 into v_order from songs;

  insert into songs (
    title, vocal, guitar1, guitar2, bass, drums, keyboard,
    sort_order, created_by_cohort, created_by_name
  )
  values (
    r.title, r.vocal, r.guitar1, r.guitar2, r.bass, r.drums, r.keyboard,
    v_order, r.created_by_cohort, r.created_by_name
  )
  returning id into v_song_id;

  delete from song_requests where id = p_id;
  return v_song_id;
end;
$$;

drop function if exists public.create_song_request(uuid, text, text[]);

create or replace function public.create_song_request(
  p_session_token uuid,
  p_title text,
  p_needed_slots text[],
  p_my_slots text[] default '{}'
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
  v_needed text[] := '{}';
  v_my text[] := coalesce(p_my_slots, '{}');
  v_slot text;
  v_vocal text := '';
  v_guitar1 text := '';
  v_guitar2 text := '';
  v_bass text := '';
  v_drums text := '';
  v_keyboard text := '';
begin
  select s.cohort, s.name into v_cohort, v_name
  from public.assert_valid_session(p_session_token) s;

  if v_title = '' then
    raise exception '곡 제목을 입력해 주세요.';
  end if;

  if p_needed_slots is null or coalesce(array_length(p_needed_slots, 1), 0) = 0 then
    raise exception '필요한 세션을 하나 이상 선택해 주세요.';
  end if;

  foreach v_slot in array p_needed_slots loop
    if v_slot not in ('vocal', 'guitar1', 'guitar2', 'bass', 'drums', 'keyboard') then
      raise exception '잘못된 세션입니다.';
    end if;
    if not (v_slot = any (v_needed)) then
      v_needed := array_append(v_needed, v_slot);
    end if;
  end loop;

  foreach v_slot in array v_my loop
    if not (v_slot = any (v_needed)) then
      raise exception '내가 할 세션은 필요한 세션 안에서만 고를 수 있습니다.';
    end if;
    case v_slot
      when 'vocal' then v_vocal := v_name;
      when 'guitar1' then v_guitar1 := v_name;
      when 'guitar2' then v_guitar2 := v_name;
      when 'bass' then v_bass := v_name;
      when 'drums' then v_drums := v_name;
      when 'keyboard' then v_keyboard := v_name;
    end case;
  end loop;

  insert into song_requests (
    title, vocal, guitar1, guitar2, bass, drums, keyboard,
    needed_slots, created_by_cohort, created_by_name
  )
  values (
    v_title, v_vocal, v_guitar1, v_guitar2, v_bass, v_drums, v_keyboard,
    v_needed, v_cohort, v_name
  )
  returning id into v_id;

  if public.song_request_is_complete(v_id) then
    perform public.promote_song_request(p_session_token, v_id);
  end if;

  return v_id;
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
begin
  select s.name into v_name
  from public.assert_valid_session(p_session_token) s;

  if p_slot not in ('vocal', 'guitar1', 'guitar2', 'bass', 'drums', 'keyboard') then
    raise exception '잘못된 세션입니다.';
  end if;

  select needed_slots into v_needed from song_requests where id = p_id for update;
  if not found then
    raise exception '신청글을 찾을 수 없습니다.';
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

grant execute on function public.create_song_request(uuid, text, text[], text[]) to anon, authenticated;
grant execute on function public.claim_song_request_slot(uuid, uuid, text) to anon, authenticated;
grant execute on function public.promote_song_request(uuid, uuid) to anon, authenticated;
grant execute on function public.song_request_is_complete(uuid) to anon, authenticated;
