-- 김희림 가입자 정보 제거
-- member_cascade_delete.sql 적용 후에는 아래 한 줄이면 충분합니다.
-- Supabase SQL Editor에서 실행

delete from members where name = '김희림';

-- 확인
select cohort, name, sessions from members order by name;
