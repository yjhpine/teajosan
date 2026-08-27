-- 곡 신청 게시판
-- Supabase SQL Editor에서 실행

create table if not exists song_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  vocal text not null default '',
  guitar1 text not null default '',
  guitar2 text not null default '',
  bass text not null default '',
  drums text not null default '',
  keyboard text not null default '',
  created_by_cohort text not null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint song_requests_title_len check (char_length(title) between 1 and 120),
  constraint song_requests_session_name_len check (
    char_length(vocal) <= 40
    and char_length(guitar1) <= 40
    and char_length(guitar2) <= 40
    and char_length(bass) <= 40
    and char_length(drums) <= 40
    and char_length(keyboard) <= 40
  )
);

create index if not exists song_requests_created_idx
  on song_requests (created_at desc);

alter table song_requests enable row level security;

drop policy if exists "anon read song_requests" on song_requests;
create policy "anon read song_requests"
  on song_requests for select to anon, authenticated using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'song_requests'
  ) then
    alter publication supabase_realtime add table public.song_requests;
  end if;
end $$;

create or replace function public.create_song_request(
  p_session_token uuid,
  p_title text,
  p_slots text[] default '{}'
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
  v_slots text[] := coalesce(p_slots, '{}');
  v_vocal text := '';
  v_guitar1 text := '';
  v_guitar2 text := '';
  v_bass text := '';
  v_drums text := '';
  v_keyboard text := '';
  v_slot text;
begin
  select s.cohort, s.name into v_cohort, v_name
  from public.assert_valid_session(p_session_token) s;

  if v_title = '' then
    raise exception '곡을 선택해 주세요.';
  end if;

  foreach v_slot in array v_slots loop
    case v_slot
      when 'vocal' then v_vocal := v_name;
      when 'guitar1' then v_guitar1 := v_name;
      when 'guitar2' then v_guitar2 := v_name;
      when 'bass' then v_bass := v_name;
      when 'drums' then v_drums := v_name;
      when 'keyboard' then v_keyboard := v_name;
      else
        raise exception '잘못된 세션입니다.';
    end case;
  end loop;

  if coalesce(array_length(v_slots, 1), 0) = 0 then
    raise exception '원하는 세션을 하나 이상 선택해 주세요.';
  end if;

  insert into song_requests (
    title, vocal, guitar1, guitar2, bass, drums, keyboard,
    created_by_cohort, created_by_name
  )
  values (
    v_title, v_vocal, v_guitar1, v_guitar2, v_bass, v_drums, v_keyboard,
    v_cohort, v_name
  )
  returning id into v_id;

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
begin
  select s.name into v_name
  from public.assert_valid_session(p_session_token) s;

  if p_slot not in ('vocal', 'guitar1', 'guitar2', 'bass', 'drums', 'keyboard') then
    raise exception '잘못된 세션입니다.';
  end if;

  if not exists (select 1 from song_requests where id = p_id) then
    raise exception '신청글을 찾을 수 없습니다.';
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
  where id = p_id
  for update;

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
end;
$$;

create or replace function public.delete_song_request(
  p_session_token uuid,
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cohort text;
  v_name text;
  v_deleted integer;
begin
  select s.cohort, s.name into v_cohort, v_name
  from public.assert_valid_session(p_session_token) s;

  delete from song_requests r
  where r.id = p_id
    and r.created_by_cohort = v_cohort
    and r.created_by_name = v_name;

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception '본인이 올린 신청만 삭제할 수 있습니다.';
  end if;
end;
$$;

grant execute on function public.create_song_request(uuid, text, text[]) to anon, authenticated;
grant execute on function public.claim_song_request_slot(uuid, uuid, text) to anon, authenticated;
grant execute on function public.delete_song_request(uuid, uuid) to anon, authenticated;
