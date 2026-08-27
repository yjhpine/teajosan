-- 곡 리스트 (시트형) + 밴드 명단
-- Supabase SQL Editor에서 실행

create table if not exists band_roster (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  constraint band_roster_name_len check (char_length(name) between 1 and 40),
  constraint band_roster_name_unique unique (name)
);

create table if not exists songs (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  vocal text not null default '',
  guitar1 text not null default '',
  guitar2 text not null default '',
  bass text not null default '',
  drums text not null default '',
  keyboard text not null default '',
  sort_order integer not null default 0,
  created_by_cohort text not null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint songs_title_len check (char_length(title) <= 120),
  constraint songs_session_name_len check (
    char_length(vocal) <= 40
    and char_length(guitar1) <= 40
    and char_length(guitar2) <= 40
    and char_length(bass) <= 40
    and char_length(drums) <= 40
    and char_length(keyboard) <= 40
  )
);

create index if not exists songs_sort_idx on songs (sort_order, created_at);

alter table band_roster enable row level security;
alter table songs enable row level security;

drop policy if exists "anon read band_roster" on band_roster;
drop policy if exists "anon read songs" on songs;

create policy "anon read band_roster"
  on band_roster for select to anon, authenticated using (true);

create policy "anon read songs"
  on songs for select to anon, authenticated using (true);

-- Realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'songs'
  ) then
    alter publication supabase_realtime add table public.songs;
  end if;
end $$;

-- 명단 시드 (시트에 나온 이름)
insert into band_roster (name) values
  ('홍의영'), ('박민성'), ('윤홍빈'), ('박은서'),
  ('양정환'), ('김유민'), ('공세현'),
  ('공예준'), ('한수빈'), ('황예진'), ('백지은'),
  ('강윤찬'), ('손연호'), ('손서영'),
  ('김혜인'), ('배소윤'), ('송하늘'),
  ('김희림')
on conflict (name) do nothing;

create or replace function public.create_song(
  p_session_token uuid,
  p_title text default '',
  p_vocal text default '',
  p_guitar1 text default '',
  p_guitar2 text default '',
  p_bass text default '',
  p_drums text default '',
  p_keyboard text default ''
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
    title, vocal, guitar1, guitar2, bass, drums, keyboard,
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
    v_order, v_cohort, v_name
  )
  returning id into v_id;

  return v_id;
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
  v_cohort text;
  v_name text;
  v_updated integer;
begin
  select s.cohort, s.name into v_cohort, v_name
  from public.assert_valid_session(p_session_token) s;

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
end;
$$;

create or replace function public.delete_song(
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
  v_deleted integer;
begin
  select s.cohort into v_cohort
  from public.assert_valid_session(p_session_token) s;

  delete from songs where id = p_id;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception '곡을 찾을 수 없습니다.';
  end if;
end;
$$;

create or replace function public.add_roster_member(
  p_session_token uuid,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(p_name);
begin
  perform public.assert_valid_session(p_session_token);
  if v_name = '' then
    raise exception '이름을 입력해 주세요.';
  end if;
  insert into band_roster (name) values (left(v_name, 40))
  on conflict (name) do nothing;
end;
$$;

grant execute on function public.create_song(uuid, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.update_song(uuid, uuid, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.delete_song(uuid, uuid) to anon, authenticated;
grant execute on function public.add_roster_member(uuid, text) to anon, authenticated;

-- 초기 곡 시드 (시트가 비어 있을 때만)
do $$
begin
  if (select count(*) from songs) = 0 then
    insert into songs (title, vocal, guitar1, guitar2, bass, drums, keyboard, sort_order, created_by_cohort, created_by_name)
    values
      ('유다빈밴드 / 축배', '홍의영', '양정환', '김유민', '공예준', '강윤찬', '김혜인', 10, '46', '양정환'),
      ('YB / 타잔', '박민성', '박민성', '공세현', '한수빈', '손연호', '배소윤', 20, '46', '양정환'),
      ('전영호 / butter-fly', '윤홍빈', '공세현', '', '황예진', '손서영', '송하늘', 30, '46', '양정환'),
      ('이츠 / emo - girl', '윤홍빈', '', '', '황예진', '', '', 40, '46', '양정환'),
      ('한로로 / ㅈㅣㅂ', '윤홍빈', '', '', '황예진', '', '', 50, '46', '양정환'),
      ('ac/dc / highway to hell', '박은서', '', '', '백지은', '', '', 60, '46', '양정환');
  end if;
end $$;
