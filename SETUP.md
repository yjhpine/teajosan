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
10. `supabase/migrations/20260827_song_owner_delete.sql` — (구) 등록자만 삭제
11. `supabase/migrations/20260827_login_rate_limit_keys.sql` — 로그인 rate limit (device/name/ip)
12. `supabase/migrations/20260827_change_my_pin.sql` — 본인 PIN 변경 RPC
13. `supabase/migrations/20260827_members_realtime.sql` — members Realtime
14. `supabase/migrations/20260827_reorder_songs.sql` — 곡 순서 변경 RPC
15. `supabase/migrations/20260827_song_delete_any_member.sql` — **곡 삭제 전원 가능**
16. `supabase/migrations/20260827_song_requests.sql` — 곡 신청 게시판
17. `supabase/migrations/20260827_song_requests_promote.sql` — 새 곡 신청·팀 완성 시 곡 리스트 이관
18. `supabase/migrations/20260827_song_youtube.sql` — 곡 신청/리스트 유튜브 링크
19. `supabase/migrations/20260827_song_request_keep_complete.sql` — 완성 신청 유지
20. `supabase/migrations/20260827_song_request_delete_with_song.sql` — 곡 삭제 시 연결 신청 삭제
21. `supabase/migrations/20260827_song_blank_reactivate_request.sql` — 곡 세션 공백 시 신청 재활성화
22. `supabase/migrations/20260827_performances.sql` — 공연 탭
23. `supabase/migrations/20260828_maintenance_mode.sql` — **점검(유지보수) 모드**
24. `supabase/migrations/20260828_admin_maintenance_bypass.sql` — **관리자 점검 우회** (46기 양정환)
25. `supabase/migrations/20260828_performance_start_time.sql` — 공연 시작 시간
26. `supabase/migrations/20260828_create_song_youtube.sql` — 곡 리스트 직접 추가 시 유튜브 URL

적용 확인: `supabase/ops/verify_applied.sql` 실행 → 각 컬럼이 `true`인지 확인.

1회용/파괴적 SQL은 `supabase/ops/` 에만 둠 (migrations에 두지 않음).

### 점검 모드 (작업 중 사용자 접속 차단)

프론트/백 작업 전후 Supabase SQL Editor에서 실행:

1. **최초 1회**: `supabase/migrations/20260828_maintenance_mode.sql`
2. **작업 시작**: `supabase/ops/maintenance_on.sql`
3. **작업 종료**: `supabase/ops/maintenance_off.sql`

점검 ON 시:
- 앱 첫 화면이 점검 안내로 전환 (Realtime으로 OFF 되면 자동 해제)
- 로그인·가입·세션 검증 및 모든 RPC( `assert_valid_session` 경유 ) 차단
- 이미 접속 중인 사용자도 Realtime으로 즉시 로그아웃·점검 화면 전환
- **관리자(`members.is_admin`)** 는 점검 중에도 로그인·이용 가능 (화면 상단에 안내 표시)

관리자 지정: `supabase/ops/grant_admin.sql` 참고

안내 문구 변경 예:

```sql
update app_settings
set maintenance_enabled = true,
    maintenance_message = 'DB 마이그레이션 중입니다. 30분 후 다시 시도해 주세요.',
    updated_at = now()
where id = 'default';
```

## 3) 권한 요약
- **합주**: 본인만 수정·삭제
- **곡**: 로그인 멤버 전원 수정·순서변경·**삭제** 가능
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
- 곡 신청: 새 곡 제목 + 유튜브 링크 + 필요 세션 칸 → 멤버가 자리 신청 → 팀 완성 시 곡 리스트로 이관 (리스트에서 재생)
