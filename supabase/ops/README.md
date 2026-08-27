# supabase/ops — 수동 1회용 SQL

이 폴더의 스크립트는 **마이그레이션이 아닙니다.**
데이터 초기화·특정 멤버 삭제 등 파괴적 작업이므로 SQL Editor에서 의도적으로만 실행하세요.

| 파일 | 용도 |
|------|------|
| `verify_applied.sql` | 핵심 스키마/RPC 적용 여부 확인 (안전, 읽기 전용) |
| `clear_old_song_assignments.sql` | 곡 세션 배정 텍스트 일괄 비우기 |
| `delete_member_kimhuirim.sql` | 특정 멤버 제거 예시 (CASCADE 적용 후 members DELETE) |

일상 스키마 변경은 `../migrations/` 를 사용합니다.
