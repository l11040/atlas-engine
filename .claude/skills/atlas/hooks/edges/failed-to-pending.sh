#!/usr/bin/env bash
# 목적: FAILED → PENDING 전이. retry_count 확인 + 파일 롤백 + artifacts 초기화
# 사용법: RUN_DIR=${RUN_DIR} bash failed-to-pending.sh TASK_ID
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
ARTIFACTS_FILE="$(task_artifacts "$TASK_ID")"
TASK_DIR="$(task_dir "$TASK_ID")"

# 목적: 현재 상태가 FAILED인지 확인
CURRENT=$(jq -r '.status' "$STATUS_FILE" 2>/dev/null)
if [ "$CURRENT" != "FAILED" ]; then
  log_error "Task $TASK_ID 상태가 FAILED가 아닙니다 (current=$CURRENT)"
  exit 1
fi

# 목적: retry_count < max_retries 확인
RETRY_COUNT=$(jq -r '.retry_count // 0' "$STATUS_FILE" 2>/dev/null)
MAX_RETRIES=$(jq -r '.max_retries // 2' "$STATUS_FILE" 2>/dev/null)

if [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; then
  log_error "Task $TASK_ID 최대 재시도 횟수 초과 (retry_count=$RETRY_COUNT, max=$MAX_RETRIES)"
  exit 1
fi

# 목적: artifact 파일 롤백 (git checkout)
if [ -f "$ARTIFACTS_FILE" ]; then
  ARTIFACT_PATHS=$(jq -r '.files[].path' "$ARTIFACTS_FILE" 2>/dev/null)
  for rel_path in $ARTIFACT_PATHS; do
    [ -z "$rel_path" ] && continue
    (cd "$PROJECT_ROOT" && git checkout -- "$rel_path" 2>/dev/null) || true
  done
fi

# 목적: artifacts.json 초기화
jq -n --arg task_id "$TASK_ID" '{"task_id": $task_id, "files": []}' > "$ARTIFACTS_FILE"

# 목적: validation 디렉토리 정리
rm -f "${TASK_DIR}/validation/validation-result.json" 2>/dev/null || true
rm -f "${TASK_DIR}/state/changes.diff" 2>/dev/null || true

# 목적: retry_count 증가 + 상태 전이 → PENDING
NEW_RETRY=$((RETRY_COUNT + 1))
TMP_FILE="${STATUS_FILE}.tmp"
jq --argjson retry "$NEW_RETRY" \
   --arg ts "$(now_iso)" \
  '.status = "PENDING" | .retry_count = $retry | .failure_reason = null | .updated_at = $ts' \
  "$STATUS_FILE" > "$TMP_FILE" && mv "$TMP_FILE" "$STATUS_FILE"

log_info "edge: $TASK_ID FAILED → PENDING (retry=${NEW_RETRY}/${MAX_RETRIES})"
