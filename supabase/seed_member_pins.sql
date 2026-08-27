-- 멤버 PIN 등록 (SQL Editor에서 실행)
-- PIN은 임시값입니다. 각 멤버에게 전달한 뒤 필요하면 같은 명령으로 재설정하세요.
--
-- 사용법:
--   SELECT admin_set_member_pin('기수', '이름', 'PIN');  -- 4자 이상
--
-- 아래는 현재 DB에 등장한 실제 멤버 기준입니다.
-- 명단에 더 있으면 같은 형식으로 줄을 추가하세요.

SELECT admin_set_member_pin('43', '김희림', '4310');
SELECT admin_set_member_pin('46', '양정환', '4610');

-- 추가 멤버 예시 (주석 해제 후 PIN 바꿔서 사용)
-- SELECT admin_set_member_pin('12', '김태조', '1210');
-- SELECT admin_set_member_pin('12', '홍길동', '1220');

-- 등록 확인
SELECT cohort, name, created_at
FROM members
ORDER BY cohort::int, name;
