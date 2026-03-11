#!/usr/bin/env bash
# 목적: /analyze 시작 전 /learn 증거 파일 존재 확인
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ATLAS_ROOT="${SCRIPT_DIR}/../.."
source "${ATLAS_ROOT}/scripts/common.sh"

load_env

EVIDENCE_FILE="${AUTOMATION_PATH}/evidence/learn.validated.json"

# 목적: learn 증거 파일 존재 확인
if [ ! -f "$EVIDENCE_FILE" ]; then
  log_error "/learn이 완료되지 않았습니다. 먼저 '/atlas learn'을 실행하세요."
  exit 1
fi

# 목적: 증거 파일의 status가 validated인지 확인
STATUS=$(jq -r '.status' "$EVIDENCE_FILE" 2>/dev/null)
if [ "$STATUS" != "validated" ]; then
  log_error "/learn 검증이 실패 상태입니다 (status=$STATUS). '/atlas learn --refresh-conventions'으로 재실행하세요."
  exit 1
fi

log_info "pre-analyze: learn 증거 확인 완료"
