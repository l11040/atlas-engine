#!/usr/bin/env bash
# 목적: PENDING → RUNNING 전이. 의존 Task가 모두 COMPLETED인지 확인 후 상태 전이
# 사용법: RUN_DIR=${RUN_DIR} bash pending-to-running.sh TASK_ID
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
META_FILE="$(task_meta "$TASK_ID")"

# 목적: 현재 상태가 PENDING인지 확인
CURRENT=$(jq -r '.status' "$STATUS_FILE" 2>/dev/null)
if [ "$CURRENT" != "PENDING" ]; then
  log_error "Task $TASK_ID 상태가 PENDING이 아닙니다 (current=$CURRENT)"
  exit 1
fi

# 목적: dependencies[] 순회 → 모든 의존 Task COMPLETED 확인
DEPS=$(jq -r '.dependencies[]?' "$META_FILE" 2>/dev/null)
for dep_id in $DEPS; do
  [ -z "$dep_id" ] && continue
  DEP_STATUS_FILE="$(task_status "$dep_id")"
  if [ ! -f "$DEP_STATUS_FILE" ]; then
    log_error "의존 Task 상태 파일 없음: $dep_id"
    exit 1
  fi
  DEP_STATUS=$(jq -r '.status' "$DEP_STATUS_FILE" 2>/dev/null)
  if [ "$DEP_STATUS" != "COMPLETED" ]; then
    log_error "의존 Task $dep_id가 COMPLETED가 아닙니다 (status=$DEP_STATUS)"
    exit 1
  fi
done

# 목적: 상태 전이 + started_at 기록
TMP_FILE="${STATUS_FILE}.tmp"
jq --arg ts "$(now_iso)" \
  '.status = "RUNNING" | .started_at = $ts | .updated_at = $ts' \
  "$STATUS_FILE" > "$TMP_FILE" && mv "$TMP_FILE" "$STATUS_FILE"

log_info "edge: $TASK_ID PENDING → RUNNING"
