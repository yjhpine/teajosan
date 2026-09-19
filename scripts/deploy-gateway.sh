#!/usr/bin/env bash
# Edge gateway 배포 + (안내) SQL 잠금
# 사용:
#   export SUPABASE_ACCESS_TOKEN=sbp_...
#   ./scripts/deploy-gateway.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REF="${SUPABASE_PROJECT_REF:-ilwfzrepvosxpefdomml}"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "SUPABASE_ACCESS_TOKEN 이 필요합니다."
  echo "https://supabase.com/dashboard/account/tokens 에서 발급하세요."
  exit 1
fi

npx supabase functions deploy gateway --project-ref "$REF"
echo
echo "✓ gateway 배포 완료"
echo "다음: Supabase SQL Editor에서 supabase/ops/apply_gateway_rpc_lockdown.sql 실행"
echo "그다음: 프론트 PR 머지 (GitHub Pages)"
