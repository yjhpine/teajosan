-- 고아(연결 끊긴) 완성 신청 정리
-- Supabase SQL Editor에서 실행
--
-- 캐시 문제가 아닙니다. 예전에 완성·이관된 신청이 DB에 남은 것이고,
-- promoted_song_id 연동 전에 생긴 건 곡 삭제와 연결되지 않습니다.
--
-- 선행 권장:
--   1) migrations/20260827_song_request_keep_complete.sql
--   2) migrations/20260827_song_request_delete_with_song.sql

-- 컬럼이 없으면 추가 (이미 있으면 무시)
alter table song_requests
  add column if not exists promoted_at timestamptz;

alter table song_requests
  add column if not exists promoted_song_id uuid;

-- 1) 아직 링크 없는 곡 ↔ 같은 제목의 최신 완성 신청 1건 백필
with candidates as (
  select distinct on (s.id)
    s.id as song_id,
    sr.id as request_id
  from songs s
  join song_requests sr
    on sr.title = s.title
   and sr.promoted_song_id is null
   and (
     sr.promoted_at is not null
     or public.song_request_is_complete(sr.id)
   )
  where not exists (
    select 1
    from song_requests linked
    where linked.promoted_song_id = s.id
  )
  order by s.id, sr.updated_at desc nulls last, sr.created_at desc
)
update song_requests sr
set
  promoted_song_id = c.song_id,
  promoted_at = coalesce(sr.promoted_at, now()),
  updated_at = now()
from candidates c
where sr.id = c.request_id;

-- 2) 곡과 연결되지 않은 완성/이관 신청 삭제 (화면의 흐린 고아 카드)
delete from song_requests sr
where (
  sr.promoted_at is not null
  or public.song_request_is_complete(sr.id)
)
and (
  sr.promoted_song_id is null
  or not exists (
    select 1 from songs s where s.id = sr.promoted_song_id
  )
);

-- 확인
select
  (select count(*) from songs) as songs_count,
  (select count(*) from song_requests) as requests_count,
  (select count(*) from song_requests where promoted_song_id is not null) as linked_complete_count,
  (select count(*) from song_requests where public.song_request_is_complete(id) and promoted_song_id is null) as orphan_complete_left;
