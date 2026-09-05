-- 곡 신청: 커스텀 세션(extra_slots) + 메모(memo)
-- Supabase SQL Editor에서 실행
-- 선행: 20260827_song_blank_reactivate_request.sql

alter table public.song_requests
  add column if not exists memo text not null default '';

alter table public.song_requests
  add column if not exists extra_slots jsonb not null default '[]'::jsonb;

alter table public.songs
  add column if not exists memo text not null default '';

alter table public.songs
  add column if not exists extra_slots jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'song_requests_memo_len'
  ) then
    alter table public.song_requests
      add constraint song_requests_memo_len check (char_length(memo) <= 300);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'songs_memo_len'
  ) then
    alter table public.songs
      add constraint songs_memo_len check (char_length(memo) <= 300);
  end if;
end $$;

-- 커스텀 세션 배열 정규화: [{id, label, name}]
create or replace function public.normalize_extra_slots(p_slots jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_item jsonb;
  v_id text;
  v_label text;
  v_name text;
  v_out jsonb := '[]'::jsonb;
  v_seen text[] := '{}';
begin
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    return '[]'::jsonb;
  end if;

  for v_item in select value from jsonb_array_elements(p_slots)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      continue;
    end if;
    v_id := left(trim(coalesce(v_item->>'id', '')), 40);
    v_label := left(trim(coalesce(v_item->>'label', '')), 20);
    v_name := left(trim(coalesce(v_item->>'name', '')), 40);
    if v_id = '' or v_label = '' then
      continue;
    end if;
    if v_id = any (v_seen) then
      continue;
    end if;
    if v_id in ('vocal', 'guitar1', 'guitar2', 'bass', 'drums', 'keyboard') then
      continue;
    end if;
    v_seen := array_append(v_seen, v_id);
    v_out := v_out || jsonb_build_array(
      jsonb_build_object('id', v_id, 'label', v_label, 'name', v_name)
    );
  end loop;

  return v_out;
end;
$$;

create or replace function public.song_request_is_complete(p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.song_requests%rowtype;
  v_slot text;
  v_val text;
  v_item jsonb;
  v_extra jsonb;
begin
  select * into r from public.song_requests where id = p_id;
  if not found then
    return false;
  end if;

  v_extra := public.normalize_extra_slots(r.extra_slots);

  if coalesce(array_length(r.needed_slots, 1), 0) = 0
     and jsonb_array_length(v_extra) = 0 then
    return false;
  end if;

  foreach v_slot in array coalesce(r.needed_slots, '{}')
  loop
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

  for v_item in select value from jsonb_array_elements(v_extra)
  loop
    if trim(coalesce(v_item->>'name', '')) = '' then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

drop function if exists public.create_song_request(uuid, text, text[], text[], text);

create or replace function public.create_song_request(
  p_session_token uuid,
  p_title text,
  p_needed_slots text[],
  p_my_slots text[] default '{}',
  p_youtube_url text default '',
  p_memo text default '',
  p_extra_slots jsonb default '[]'::jsonb
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
  v_youtube text := left(trim(coalesce(p_youtube_url, '')), 300);
  v_memo text := left(trim(coalesce(p_memo, '')), 300);
  v_needed text[] := '{}';
  v_my text[] := coalesce(p_my_slots, '{}');
  v_slot text;
  v_vocal text := '';
  v_guitar1 text := '';
  v_guitar2 text := '';
  v_bass text := '';
  v_drums text := '';
  v_keyboard text := '';
  v_extra jsonb;
  v_item jsonb;
  v_out jsonb := '[]'::jsonb;
begin
  select s.cohort, s.name into v_cohort, v_name
  from public.assert_valid_session(p_session_token) s;

  if v_title = '' then
    raise exception '곡 제목을 입력해 주세요.';
  end if;

  v_extra := public.normalize_extra_slots(p_extra_slots);

  if (p_needed_slots is null or coalesce(array_length(p_needed_slots, 1), 0) = 0)
     and jsonb_array_length(v_extra) = 0 then
    raise exception '필요한 세션을 하나 이상 선택해 주세요.';
  end if;

  foreach v_slot in array coalesce(p_needed_slots, '{}')
  loop
    if v_slot not in ('vocal', 'guitar1', 'guitar2', 'bass', 'drums', 'keyboard') then
      raise exception '잘못된 세션입니다.';
    end if;
    if not (v_slot = any (v_needed)) then
      v_needed := array_append(v_needed, v_slot);
    end if;
  end loop;

  foreach v_slot in array v_my
  loop
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

  -- 커스텀 세션: name이 비어 있지 않으면 본인 이름으로 확정, 아니면 공란 유지
  for v_item in select value from jsonb_array_elements(v_extra)
  loop
    if trim(coalesce(v_item->>'name', '')) <> '' then
      v_out := v_out || jsonb_build_array(
        jsonb_build_object(
          'id', v_item->>'id',
          'label', v_item->>'label',
          'name', v_name
        )
      );
    else
      v_out := v_out || jsonb_build_array(
        jsonb_build_object(
          'id', v_item->>'id',
          'label', v_item->>'label',
          'name', ''
        )
      );
    end if;
  end loop;

  insert into song_requests (
    title, vocal, guitar1, guitar2, bass, drums, keyboard, youtube_url,
    needed_slots, memo, extra_slots, created_by_cohort, created_by_name
  )
  values (
    v_title, v_vocal, v_guitar1, v_guitar2, v_bass, v_drums, v_keyboard, v_youtube,
    v_needed, v_memo, v_out, v_cohort, v_name
  )
  returning id into v_id;

  if public.song_request_is_complete(v_id) then
    perform public.promote_song_request(p_session_token, v_id);
  end if;

  return v_id;
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
  v_extra jsonb;
begin
  perform public.assert_valid_session(p_session_token);

  select * into r from song_requests where id = p_id for update;
  if not found then
    raise exception '신청글을 찾을 수 없습니다.';
  end if;

  if not public.song_request_is_complete(p_id) then
    raise exception '아직 팀이 완성되지 않았습니다.';
  end if;

  v_extra := public.normalize_extra_slots(r.extra_slots);

  if r.promoted_at is not null and r.promoted_song_id is not null then
    return r.promoted_song_id;
  end if;

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
        memo = coalesce(r.memo, ''),
        extra_slots = v_extra,
        updated_at = now()
    where id = r.promoted_song_id;

    if not found then
      select coalesce(max(sort_order), 0) + 10 into v_order from songs;
      insert into songs (
        title, vocal, guitar1, guitar2, bass, drums, keyboard, youtube_url,
        memo, extra_slots, sort_order, created_by_cohort, created_by_name
      )
      values (
        r.title, r.vocal, r.guitar1, r.guitar2, r.bass, r.drums, r.keyboard,
        coalesce(r.youtube_url, ''),
        coalesce(r.memo, ''), v_extra,
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
    memo, extra_slots, sort_order, created_by_cohort, created_by_name
  )
  values (
    r.title, r.vocal, r.guitar1, r.guitar2, r.bass, r.drums, r.keyboard,
    coalesce(r.youtube_url, ''),
    coalesce(r.memo, ''), v_extra,
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
  v_extra jsonb;
  v_fixed boolean;
  v_found boolean := false;
  v_item jsonb;
  v_out jsonb := '[]'::jsonb;
  v_slot text := trim(coalesce(p_slot, ''));
begin
  select s.name into v_name
  from public.assert_valid_session(p_session_token) s;

  select needed_slots, promoted_at, promoted_song_id, extra_slots
  into v_needed, v_promoted, v_song_id, v_extra
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

  v_fixed := v_slot in ('vocal', 'guitar1', 'guitar2', 'bass', 'drums', 'keyboard');

  if v_fixed then
    if not (v_slot = any (coalesce(v_needed, '{}'))) then
      raise exception '이 신청에 없는 세션입니다.';
    end if;

    select case v_slot
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
        vocal = case when v_slot = 'vocal' then v_name else vocal end,
        guitar1 = case when v_slot = 'guitar1' then v_name else guitar1 end,
        guitar2 = case when v_slot = 'guitar2' then v_name else guitar2 end,
        bass = case when v_slot = 'bass' then v_name else bass end,
        drums = case when v_slot = 'drums' then v_name else drums end,
        keyboard = case when v_slot = 'keyboard' then v_name else keyboard end,
        updated_at = now()
      where id = p_id;
    elsif v_current = v_name then
      update song_requests set
        vocal = case when v_slot = 'vocal' then '' else vocal end,
        guitar1 = case when v_slot = 'guitar1' then '' else guitar1 end,
        guitar2 = case when v_slot = 'guitar2' then '' else guitar2 end,
        bass = case when v_slot = 'bass' then '' else bass end,
        drums = case when v_slot = 'drums' then '' else drums end,
        keyboard = case when v_slot = 'keyboard' then '' else keyboard end,
        updated_at = now()
      where id = p_id;
    else
      raise exception '이미 다른 멤버가 신청한 세션입니다.';
    end if;
  else
    v_extra := public.normalize_extra_slots(v_extra);
    for v_item in select value from jsonb_array_elements(v_extra)
    loop
      if v_item->>'id' = v_slot then
        v_found := true;
        v_current := coalesce(v_item->>'name', '');
        if trim(v_current) = '' then
          v_out := v_out || jsonb_build_array(
            jsonb_build_object('id', v_item->>'id', 'label', v_item->>'label', 'name', v_name)
          );
        elsif v_current = v_name then
          v_out := v_out || jsonb_build_array(
            jsonb_build_object('id', v_item->>'id', 'label', v_item->>'label', 'name', '')
          );
        else
          raise exception '이미 다른 멤버가 신청한 세션입니다.';
        end if;
      else
        v_out := v_out || jsonb_build_array(v_item);
      end if;
    end loop;

    if not v_found then
      raise exception '이 신청에 없는 세션입니다.';
    end if;

    update song_requests
    set extra_slots = v_out,
        updated_at = now()
    where id = p_id;
  end if;

  if v_song_id is not null then
    select * into r from song_requests where id = p_id;
    update songs
    set vocal = r.vocal,
        guitar1 = r.guitar1,
        guitar2 = r.guitar2,
        bass = r.bass,
        drums = r.drums,
        keyboard = r.keyboard,
        memo = coalesce(r.memo, ''),
        extra_slots = public.normalize_extra_slots(r.extra_slots),
        updated_at = now()
    where id = v_song_id;
  end if;

  if public.song_request_is_complete(p_id) then
    perform public.promote_song_request(p_session_token, p_id);
  end if;
end;
$$;

drop function if exists public.update_song(uuid, uuid, text, text, text, text, text, text, text);

create or replace function public.update_song(
  p_session_token uuid,
  p_id uuid,
  p_title text default null,
  p_vocal text default null,
  p_guitar1 text default null,
  p_guitar2 text default null,
  p_bass text default null,
  p_drums text default null,
  p_keyboard text default null,
  p_memo text default null,
  p_extra_slots jsonb default null
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
      memo = coalesce(left(trim(p_memo), 300), s.memo),
      extra_slots = case
        when p_extra_slots is null then s.extra_slots
        else public.normalize_extra_slots(p_extra_slots)
      end,
      updated_at = now()
  where s.id = p_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception '곡을 찾을 수 없습니다.';
  end if;

  update song_requests sr
  set title = s.title,
      vocal = s.vocal,
      guitar1 = s.guitar1,
      guitar2 = s.guitar2,
      bass = s.bass,
      drums = s.drums,
      keyboard = s.keyboard,
      memo = s.memo,
      extra_slots = s.extra_slots,
      updated_at = now()
  from songs s
  where sr.promoted_song_id = s.id
    and s.id = p_id;

  update song_requests sr
  set promoted_at = null,
      updated_at = now()
  where sr.promoted_song_id = p_id
    and sr.promoted_at is not null
    and not public.song_request_is_complete(sr.id);

  update song_requests sr
  set promoted_at = coalesce(sr.promoted_at, now()),
      updated_at = now()
  where sr.promoted_song_id = p_id
    and public.song_request_is_complete(sr.id);
end;
$$;

grant execute on function public.normalize_extra_slots(jsonb) to anon, authenticated;
grant execute on function public.song_request_is_complete(uuid) to anon, authenticated;
grant execute on function public.create_song_request(uuid, text, text[], text[], text, text, jsonb) to anon, authenticated;
grant execute on function public.promote_song_request(uuid, uuid) to anon, authenticated;
grant execute on function public.claim_song_request_slot(uuid, uuid, text) to anon, authenticated;
grant execute on function public.update_song(uuid, uuid, text, text, text, text, text, text, text, text, jsonb) to anon, authenticated;
