-- 김희림 가입자 정보 제거
-- Supabase SQL Editor에서 실행

-- 곡 배정에서 이름 제거
update songs set vocal = '' where vocal = '김희림';
update songs set guitar1 = '' where guitar1 = '김희림';
update songs set guitar2 = '' where guitar2 = '김희림';
update songs set bass = '' where bass = '김희림';
update songs set drums = '' where drums = '김희림';
update songs set keyboard = '' where keyboard = '김희림';

-- 세션/기기/명단/멤버 삭제
delete from sessions where name = '김희림';
delete from devices where name = '김희림';
delete from band_roster where name = '김희림';
delete from members where name = '김희림';

-- 확인
select cohort, name, sessions from members order by name;
