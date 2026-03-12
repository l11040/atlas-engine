#!/usr/bin/env bash
# 목적: /plan 시작 전 /analyze 증거 파일 존재 확인
# 주의: RUN_DIR 환경변수가 설정되어 있어야 한다
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ATLAS_ROOT="${SCRIPT_DIR}/../.."
source "${ATLAS_ROOT}/scripts/common.sh"

load_env

# 목적: RUN_DIR 확인
if [ -z "${RUN_DIR:-}" ]; then
  log_error "RUN_DIR 환경변수가 설정되지 않았습니다."
  exit 1
fi

EVIDENCE_FILE="${RUN_DIR}/evidence/analyze.validated.json"

# 목적: analyze 증거 파일 존재 확인
if [ ! -f "$EVIDENCE_FILE" ]; then
  log_error "/analyze가 완료되지 않았습니다. 먼저 '/atlas analyze <TICKET_KEY>'를 실행하세요."
  exit 1
fi

# 목적: 증거 파일의 status가 validated인지 확인
STATUS=$(jq -r '.status' "$EVIDENCE_FILE" 2>/dev/null)
if [ "$STATUS" != "validated" ]; then
  log_error "/analyze 검증이 실패 상태입니다 (status=$STATUS). '/atlas analyze <TICKET_KEY> --force'로 재실행하세요."
  exit 1
fi

log_info "pre-plan: analyze 증거 확인 완료"
