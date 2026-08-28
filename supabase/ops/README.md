# supabase/ops — 수동 1회용 SQL

이 폴더의 스크립트는 **마이그레이션이 아닙니다.**
데이터 초기화·특정 멤버 삭제 등 파괴적 작업이므로 SQL Editor에서 의도적으로만 실행하세요.

| 파일 | 용도 |
|------|------|
| `verify_applied.sql` | 핵심 스키마/RPC 적용 여부 확인 (안전, 읽기 전용) |
| `cleanup_orphan_promoted_requests.sql` | 곡과 연결 안 된 완성(흐린) 신청 정리 |
| `maintenance_on.sql` | 점검 모드 켜기 (사용자 접속 차단) |
| `maintenance_off.sql` | 점검 모드 끄기 |
| `grant_admin.sql` | 멤버 관리자 권한 부여 (점검 중 접속 허용) |
| `fix_admin_bypass_validate_session.sql` | admin bypass SQL이 validate_session 에서 실패했을 때 이어서 실행 |
| `clear_old_song_assignments.sql` | 곡 세션 배정 텍스트 일괄 비우기 |
| `delete_member_kimhuirim.sql` | 특정 멤버 제거 예시 (CASCADE 적용 후 members DELETE) |

일상 스키마 변경은 `../migrations/` 를 사용합니다.
