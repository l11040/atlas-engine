#!/usr/bin/env bash
# 목적: VALIDATING → REVIEWING 전이. validation-result.json의 passed 확인
# 실패 시 FAILED로 전이 + failure_reason 기록
# 사용법: RUN_DIR=${RUN_DIR} bash validating-to-reviewing.sh TASK_ID
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ATLAS_ROOT="${SCRIPT_DIR}/../.."
source "${ATLAS_ROOT}/scripts/common.sh"

load_env

TASK_ID="${1:?Error: TASK_ID is required}"

if [ -z "${RUN_DIR:-}" ]; then
  log_error "RUN_DIR 환경변수가 설정되지 않았습니다."
  exit 1
fi

STATUS_FILE="$(task_status "$TASK_ID")"
TASK_DIR="$(task_dir "$TASK_ID")"
VALIDATION_FILE="${TASK_DIR}/validation/validation-result.json"

# 목적: 현재 상태가 VALIDATING인지 확인
CURRENT=$(jq -r '.status' "$STATUS_FILE" 2>/dev/null)
if [ "$CURRENT" != "VALIDATING" ]; then
  log_error "Task $TASK_ID 상태가 VALIDATING이 아닙니다 (current=$CURRENT)"
  exit 1
fi

# 목적: validation-result.json 존재 확인
if [ ! -f "$VALIDATION_FILE" ]; then
  log_error "validation-result.json not found: $VALIDATION_FILE"
  exit 1
fi

PASSED=$(jq -r '.passed' "$VALIDATION_FILE" 2>/dev/null)

if [ "$PASSED" = "true" ]; then
  # 목적: 검증 통과 → REVIEWING으로 전이
  update_status "$TASK_ID" "REVIEWING"
  log_info "edge: $TASK_ID VALIDATING → REVIEWING (검증 통과)"
else
  # 주의: 검증 실패 → FAILED로 전이 + failure_reason 기록
  OUTPUT=$(jq -r '.output // "unknown"' "$VALIDATION_FILE" 2>/dev/null)
  REASON="Build validation failed: ${OUTPUT:0:500}"

  TMP_FILE="${STATUS_FILE}.tmp"
  jq --arg status "FAILED" \
     --arg reason "$REASON" \
     --arg ts "$(now_iso)" \
     '.status = $status | .failure_reason = $reason | .updated_at = $ts' \
     "$STATUS_FILE" > "$TMP_FILE" && mv "$TMP_FILE" "$STATUS_FILE"

  log_error "edge: $TASK_ID VALIDATING → FAILED (검증 실패)"
  exit 1
fi
