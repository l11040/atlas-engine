#!/usr/bin/env bash
# 목적: Task 실행 완료 후 duration_ms 계산 + transition-log.json 갱신
# 사용법: RUN_DIR=${RUN_DIR} bash post-task.sh TASK_ID
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

TASK_DIR="$(task_dir "$TASK_ID")"
STATUS_FILE="$(task_status "$TASK_ID")"
STARTED_MS_FILE="${TASK_DIR}/state/started-ms.txt"

# 목적: duration_ms 계산
END_MS=$(now_ms)
if [ -f "$STARTED_MS_FILE" ]; then
  START_MS=$(cat "$STARTED_MS_FILE")
  DURATION=$((END_MS - START_MS))
else
  DURATION=0
fi

# 목적: status.json에 duration_ms 기록
if [ -f "$STATUS_FILE" ]; then
  TMP_FILE="${STATUS_FILE}.tmp"
  jq --argjson dur "$DURATION" '.duration_ms = $dur' "$STATUS_FILE" > "$TMP_FILE" && mv "$TMP_FILE" "$STATUS_FILE"
fi

# 목적: transition-log.json 갱신 (run 레벨)
LOG_FILE="${RUN_DIR}/transition-log.json"
FINAL_STATUS=$(jq -r '.status' "$STATUS_FILE" 2>/dev/null || echo "UNKNOWN")

ENTRY=$(jq -n \
  --arg task_id "$TASK_ID" \
  --arg status "$FINAL_STATUS" \
  --argjson duration "$DURATION" \
  --arg completed_at "$(now_iso)" \
  '{task_id: $task_id, final_status: $status, duration_ms: $duration, completed_at: $completed_at}')

if [ -f "$LOG_FILE" ]; then
  TMP_LOG="${LOG_FILE}.tmp"
  jq --argjson entry "$ENTRY" '.entries += [$entry]' "$LOG_FILE" > "$TMP_LOG" && mv "$TMP_LOG" "$LOG_FILE"
else
  jq -n --argjson entry "$ENTRY" '{entries: [$entry]}' > "$LOG_FILE"
fi

log_info "post-task: $TASK_ID — ${FINAL_STATUS}, duration=${DURATION}ms"
