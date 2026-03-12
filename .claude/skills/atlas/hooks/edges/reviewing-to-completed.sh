#!/usr/bin/env bash
# 목적: REVIEWING → COMPLETED 전이. git add + commit + hash 기록 + evidence 생성
# 사용법: RUN_DIR=${RUN_DIR} bash reviewing-to-completed.sh TASK_ID
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
ARTIFACTS_FILE="$(task_artifacts "$TASK_ID")"
TASK_DIR="$(task_dir "$TASK_ID")"

# 목적: 현재 상태가 REVIEWING인지 확인
CURRENT=$(jq -r '.status' "$STATUS_FILE" 2>/dev/null)
if [ "$CURRENT" != "REVIEWING" ]; then
  log_error "Task $TASK_ID 상태가 REVIEWING이 아닙니다 (current=$CURRENT)"
  exit 1
fi

# 목적: 커밋 메시지 구성
TASK_TYPE=$(jq -r '.type // "feat"' "$META_FILE" 2>/dev/null)
TASK_TITLE=$(jq -r '.title // "untitled"' "$META_FILE" 2>/dev/null)
COMMIT_MSG="[${TASK_ID}] ${TASK_TYPE}: ${TASK_TITLE}"

# 목적: artifact 파일을 git add
ARTIFACT_PATHS=$(jq -r '.files[].path' "$ARTIFACTS_FILE" 2>/dev/null)
for rel_path in $ARTIFACT_PATHS; do
  [ -z "$rel_path" ] && continue
  (cd "$PROJECT_ROOT" && git add "$rel_path" 2>/dev/null) || true
done

# 목적: git commit
COMMIT_HASH=""
if (cd "$PROJECT_ROOT" && git diff --cached --quiet 2>/dev/null); then
  # 주의: staged 변경이 없는 경우 (이미 커밋되었거나 변경 없음)
  log_warn "staging area가 비어있습니다. 이미 커밋되었을 수 있습니다."
  COMMIT_HASH=$(cd "$PROJECT_ROOT" && git rev-parse HEAD)
else
  COMMIT_HASH=$(cd "$PROJECT_ROOT" && git commit -m "$COMMIT_MSG" --quiet 2>&1 && git rev-parse HEAD)
  if [ $? -ne 0 ]; then
    log_error "git commit 실패: $COMMIT_HASH"
    exit 1
  fi
  COMMIT_HASH=$(cd "$PROJECT_ROOT" && git rev-parse HEAD)
fi

log_info "edge: $TASK_ID — 커밋 완료: $COMMIT_HASH"

# 목적: git.json 기록
GIT_FILE="${TASK_DIR}/state/git.json"
jq -n \
  --arg task_id "$TASK_ID" \
  --arg commit_hash "$COMMIT_HASH" \
  --arg commit_message "$COMMIT_MSG" \
  --arg committed_at "$(now_iso)" \
  '{task_id: $task_id, commit_hash: $commit_hash, commit_message: $commit_message, committed_at: $committed_at}' \
  > "$GIT_FILE"

# 목적: evidence-event.json 생성
EVIDENCE_DIR="${TASK_DIR}/evidence"
mkdir -p "$EVIDENCE_DIR"
jq -n \
  --arg task_id "$TASK_ID" \
  --arg event "task_completed" \
  --arg commit_hash "$COMMIT_HASH" \
  --arg timestamp "$(now_iso)" \
  '{task_id: $task_id, event: $event, commit_hash: $commit_hash, timestamp: $timestamp}' \
  > "${EVIDENCE_DIR}/evidence-event.json"

# 목적: 상태 전이 → COMPLETED + completed_at
TMP_FILE="${STATUS_FILE}.tmp"
jq --arg ts "$(now_iso)" \
  '.status = "COMPLETED" | .completed_at = $ts | .updated_at = $ts' \
  "$STATUS_FILE" > "$TMP_FILE" && mv "$TMP_FILE" "$STATUS_FILE"

log_info "edge: $TASK_ID REVIEWING → COMPLETED (commit=$COMMIT_HASH)"
