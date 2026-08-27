-- 예전에 저장된 세션 배정/시드 명단 정리
-- SQL Editor에서 실행

-- 곡의 보컬/기타/베이스/드럼/키보드 배정 전부 비우기 (곡 제목은 유지)
update songs
set vocal = '',
    guitar1 = '',
    guitar2 = '',
    bass = '',
    drums = '',
    keyboard = '',
    updated_at = now();

-- 세션을 아직 고르지 않은 옛 시드 명단 제거
-- (set_my_sessions 하면 다시 자동 등록됨)
delete from band_roster
where name not in (
  select m.name
  from members m
  where coalesce(array_length(m.sessions, 1), 0) > 0
);

select title, vocal, guitar1, guitar2, bass, drums, keyboard from songs order by sort_order;
select name from band_roster order by name;
