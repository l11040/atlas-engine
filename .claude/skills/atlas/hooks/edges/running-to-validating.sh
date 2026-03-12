#!/usr/bin/env bash
# 목적: RUNNING → VALIDATING 전이. artifacts.json 비어있지 않은지 + 파일 존재 확인 + diff 생성
# 사용법: RUN_DIR=${RUN_DIR} bash running-to-validating.sh TASK_ID
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

# 목적: 현재 상태가 RUNNING인지 확인
CURRENT=$(jq -r '.status' "$STATUS_FILE" 2>/dev/null)
if [ "$CURRENT" != "RUNNING" ]; then
  log_error "Task $TASK_ID 상태가 RUNNING이 아닙니다 (current=$CURRENT)"
  exit 1
fi

# 목적: artifacts.json 존재 + 비어있지 않은지 확인
if [ ! -f "$ARTIFACTS_FILE" ]; then
  log_error "artifacts.json not found: $ARTIFACTS_FILE"
  exit 1
fi

FILE_COUNT=$(jq '.files | length' "$ARTIFACTS_FILE" 2>/dev/null || echo "0")
if [ "$FILE_COUNT" -eq 0 ]; then
  log_error "artifacts.json에 파일이 없습니다: $TASK_ID"
  exit 1
fi

# 목적: 각 artifact 파일 존재 확인
ARTIFACT_PATHS=$(jq -r '.files[].path' "$ARTIFACTS_FILE" 2>/dev/null)
for rel_path in $ARTIFACT_PATHS; do
  [ -z "$rel_path" ] && continue
  if [ ! -f "${PROJECT_ROOT}/${rel_path}" ]; then
    log_error "artifact 파일이 존재하지 않습니다: $rel_path"
    exit 1
  fi
done

# 목적: git diff → changes.diff 생성
DIFF_FILE="${TASK_DIR}/state/changes.diff"
DIFF_PATHS=$(jq -r '.files[].path' "$ARTIFACTS_FILE" 2>/dev/null | tr '\n' ' ')
if [ -n "$DIFF_PATHS" ]; then
  (cd "$PROJECT_ROOT" && git diff HEAD -- $DIFF_PATHS > "$DIFF_FILE" 2>/dev/null) || true
fi

# 목적: 상태 전이
update_status "$TASK_ID" "VALIDATING"

log_info "edge: $TASK_ID RUNNING → VALIDATING (${FILE_COUNT}개 artifact)"
