-- 공연 일정 + 출연 곡
-- Supabase SQL Editor에서 실행

create table if not exists performances (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  performance_date date not null,
  place text not null default '',
  note text not null default '',
  created_by_cohort text not null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint performances_title_len check (char_length(title) between 1 and 120),
  constraint performances_place_len check (char_length(place) <= 120),
  constraint performances_note_len check (char_length(note) <= 500)
);

create index if not exists performances_date_idx
  on performances (performance_date desc, created_at desc);

create table if not exists performance_songs (
  performance_id uuid not null references public.performances(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (performance_id, song_id)
);

create index if not exists performance_songs_song_idx
  on performance_songs (song_id);

create index if not exists performance_songs_order_idx
  on performance_songs (performance_id, sort_order);

alter table performances enable row level security;
alter table performance_songs enable row level security;

drop policy if exists "anon read performances" on performances;
create policy "anon read performances"
  on performances for select to anon, authenticated using (true);

drop policy if exists "anon read performance_songs" on performance_songs;
create policy "anon read performance_songs"
  on performance_songs for select to anon, authenticated using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'performances'
  ) then
    alter publication supabase_realtime add table public.performances;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'performance_songs'
  ) then
    alter publication supabase_realtime add table public.performance_songs;
  end if;
end $$;

create or replace function public.set_performance_songs(
  p_performance_id uuid,
  p_song_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[] := coalesce(p_song_ids, '{}');
  v_i integer;
  v_song uuid;
begin
  delete from performance_songs where performance_id = p_performance_id;

  for v_i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
    v_song := v_ids[v_i];
    if not exists (select 1 from songs where id = v_song) then
      raise exception '곡 리스트에 없는 곡입니다.';
    end if;
    insert into performance_songs (performance_id, song_id, sort_order)
    values (p_performance_id, v_song, (v_i - 1) * 10)
    on conflict (performance_id, song_id) do update
      set sort_order = excluded.sort_order;
  end loop;
end;
$$;

create or replace function public.create_performance(
  p_session_token uuid,
  p_title text,
  p_performance_date date,
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

  insert into performances (
    title, performance_date, place, note,
    created_by_cohort, created_by_name
  )
  values (
    v_title, p_performance_date, v_place, v_note,
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

  update performances
  set title = v_title,
      performance_date = p_performance_date,
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

create or replace function public.delete_performance(
  p_session_token uuid,
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  perform public.assert_valid_session(p_session_token);

  delete from performances where id = p_id;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception '공연을 찾을 수 없습니다.';
  end if;
end;
$$;

revoke all on function public.set_performance_songs(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.create_performance(uuid, text, date, text, text, uuid[]) to anon, authenticated;
grant execute on function public.update_performance(uuid, uuid, text, date, text, text, uuid[]) to anon, authenticated;
grant execute on function public.delete_performance(uuid, uuid) to anon, authenticated;
