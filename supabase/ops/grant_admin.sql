-- 멤버에게 관리자 권한 부여 (점검 모드 우회)
-- Supabase SQL Editor에서 실행

-- 예: 46기 양정환
update members
set is_admin = true
where cohort = '46' and name = '양정환';

select cohort, name, is_admin from members where is_admin = true order by cohort, name;
