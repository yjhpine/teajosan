# 태조산 합주 캘린더 — 설정 / DB

## 1) Supabase 프로젝트
1. https://supabase.com → New project (`teajosan`, 가능하면 Seoul)
2. Project Settings → API 에서 **Project URL**, **anon public key** 복사

## 2) SQL 적용 순서 (SQL Editor)

새 DB라면 위에서 아래로 실행. 이미 운영 중이면 **미적용분만** 실행.

1. `supabase/migrations/20260827_security_hardening.sql` — 멤버 PIN, 세션 RPC, RLS
2. `supabase/migrations/20260827_fix_pgcrypto_extensions.sql` — pgcrypto 경로
3. `supabase/migrations/20260827_enable_realtime.sql` — Realtime
4. `supabase/migrations/20260827_song_list.sql` — 곡 리스트
5. `supabase/migrations/20260827_member_sessions.sql` — 멤버 세션(악기)
6. `supabase/migrations/20260827_fix_session_name_ambiguous.sql` — name ambiguous 수정
7. `supabase/migrations/20260827_signup_name_login.sql` — 셀프 가입 + 이름/PIN 로그인
8. `supabase/migrations/20260827_member_cascade_delete.sql` — 멤버 삭제 CASCADE
9. `supabase/migrations/20260827_signup_cohort_name_check.sql` — 가입 기수·이름 중복 차단
10. `supabase/migrations/20260827_song_owner_delete.sql` — **곡 삭제는 등록자만** (수정은 전원)
11. `supabase/migrations/20260827_login_rate_limit_keys.sql` — 로그인 rate limit (device/name/ip)
12. `supabase/migrations/20260827_change_my_pin.sql` — 본인 PIN 변경 RPC
13. `supabase/migrations/20260827_members_realtime.sql` — members Realtime
14. `supabase/migrations/20260827_reorder_songs.sql` — 곡 순서 변경 RPC

적용 확인: `supabase/ops/verify_applied.sql` 실행 → 각 컬럼이 `true`인지 확인.

1회용/파괴적 SQL은 `supabase/ops/` 에만 둠 (migrations에 두지 않음).

## 3) 권한 요약
- **합주**: 본인만 수정·삭제
- **곡**: 로그인 멤버 전원 수정·순서변경 / **등록자만 삭제**
- **가입**: 기수+이름 중복 불가, 이름은 전역 유니크
- **로그인**: device·이름·IP 버킷 중 하나라도 5분에 10회 실패하면 잠시 차단
- **PIN**: 로그인 후 마이페이지에서 본인 변경. 분실 시 관리자가 `admin_set_member_pin(기수, 이름, 새PIN)` 으로 재설정

## 4) 로컬
`.env.local`:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

`npm install && npm run dev`

검증(선택): `node scripts/verify-security.mjs`  
(사전: `SELECT admin_set_member_pin('99','테스트','test1234');`)

## 5) GitHub Pages / CI
Secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`  
Settings → Pages → Source: GitHub Actions  
배포 주소 예: `https://yjhpine.github.io/teajosan/`  
PR/main: `.github/workflows/ci.yml` 에서 `lint` + `build` (live DB verify는 CI에 넣지 않음)

## 동작
- 가입(기수·이름·PIN·세션) 또는 이름+PIN 로그인 → 기기(localStorage)에 세션 유지
- 합주·곡·멤버·활동로그는 Realtime으로 자동 동기화
- 마이페이지에서 PIN 변경, 곡 리스트 ↑↓로 순서 변경
