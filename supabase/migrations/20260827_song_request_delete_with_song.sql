-- 곡 리스트 삭제 시 이관된(흐린) 신청글도 함께 삭제
-- Supabase SQL Editor에서 실행
-- 선행: 20260827_song_request_keep_complete.sql (promoted_at)

alter table song_requests
  add column if not exists promoted_at timestamptz;

alter table song_requests
  add column if not exists promoted_song_id uuid;

do $$
begin
  alter table song_requests
    add constraint song_requests_promoted_song_id_fkey
    foreign key (promoted_song_id) references public.songs(id) on delete cascade;
exception
  when duplicate_object then null;
end $$;

create index if not exists song_requests_promoted_song_id_idx
  on song_requests (promoted_song_id)
  where promoted_song_id is not null;

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

  if r.promoted_at is not null then
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
  v_deleted integer;
begin
  perform public.assert_valid_session(p_session_token);

  -- FK cascade로 연결된 신청도 같이 지워지지만, 명시적으로도 정리
  delete from song_requests where promoted_song_id = p_id;

  delete from songs where id = p_id;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception '곡을 찾을 수 없습니다.';
  end if;
end;
$$;

grant execute on function public.promote_song_request(uuid, uuid) to anon, authenticated;
grant execute on function public.delete_song(uuid, uuid) to anon, authenticated;
