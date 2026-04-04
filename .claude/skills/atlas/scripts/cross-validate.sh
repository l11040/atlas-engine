#!/bin/bash
# cross-validate.sh — Gate E-post: 태스크/커밋/검증 파일 체인 교차 검증
#
# Usage:
#   cross-validate.sh <task.json> [output-dir] [project-root]
#   cross-validate.sh <task-id> <run-dir> [project-root]
#
# 검증:
#   1. task_files: task-{id}.json의 files[]
#   2. committed_files: commit.json의 커밋 또는 파일별 최근 커밋 이력 기반 파일
#   3. checked_files: convention-check.json + validate.json에서 검사한 파일
#   4. task_files ⊆ committed_files
#   5. committed_files ⊆ checked_files
#
# 결과: cross-validation.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

require_jq

# --- 인자 파싱 ---
if [ "$#" -ge 2 ] && [ ! -f "$1" ] && [ -d "$2" ] && [ -f "${2}/tasks/${1}.json" ]; then
  TASK_ID_INPUT="$1"
  RUN_DIR="$2"
  TASK_JSON="${RUN_DIR}/tasks/${TASK_ID_INPUT}.json"
  OUTPUT_DIR="${RUN_DIR}/evidence/${TASK_ID_INPUT}"
  PROJECT_ROOT="${3:-.}"
else
  TASK_JSON="${1:?Usage: cross-validate.sh <task.json> [output-dir] [project-root]}"
  OUTPUT_DIR="${2:-.}"
  PROJECT_ROOT="${3:-.}"
fi

if ! validate_json_file "$TASK_JSON" "task.json"; then
  exit 2
fi

TASK_ID=$(jq -r '.task_id // "unknown"' "$TASK_JSON")
log_info "Gate E-post 교차 검증 시작: ${TASK_ID}"

mkdir -p "$OUTPUT_DIR"

# --- 1. task_files 수집 ---
TASK_FILES=$(jq -r '.files // [] | .[]' "$TASK_JSON" | sort)

# --- 2. committed_files 수집 ---
cd "$PROJECT_ROOT"
COMMIT_EVIDENCE="${OUTPUT_DIR}/commit.json"
COMMIT_SHA=""
VERIFICATION_MODE="per_file_commit_history"

if [ -f "$COMMIT_EVIDENCE" ]; then
  COMMIT_SHA=$(jq -r '.commit_sha // ""' "$COMMIT_EVIDENCE" 2>/dev/null || echo "")
fi

if [ -n "$COMMIT_SHA" ]; then
  COMMITTED_FILES=$(git diff-tree --root --no-commit-id --name-only -r "$COMMIT_SHA" 2>/dev/null | sort || true)
  VERIFICATION_MODE="commit_evidence"
else
  COMMITTED_FILES=""
  while IFS= read -r tf; do
    [ -z "$tf" ] && continue
    if git log --format='%H' -- "$tf" | head -1 | grep -q .; then
      COMMITTED_FILES="${COMMITTED_FILES}${tf}"$'\n'
    fi
  done <<< "$TASK_FILES"
  COMMITTED_FILES=$(echo "$COMMITTED_FILES" | sort -u)
fi

# --- 3. checked_files 수집 ---
CHECKED_FILES=""
if [ -f "${OUTPUT_DIR}/validate.json" ]; then
  CHECKED_FILES=$(jq -r '.files_checked // [] | .[]' "${OUTPUT_DIR}/validate.json" 2>/dev/null | sort || true)
fi
if [ -z "$CHECKED_FILES" ]; then
  CHECKED_FILES=$(jq -r '.files // [] | .[]' "$TASK_JSON" | sort)
fi

# --- 4. task_files ⊆ committed_files ---
TASK_NOT_COMMITTED="[]"
while IFS= read -r tf; do
  [ -z "$tf" ] && continue
  if ! echo "$COMMITTED_FILES" | grep -qxF "$tf"; then
    TASK_NOT_COMMITTED=$(echo "$TASK_NOT_COMMITTED" | jq --arg f "$tf" '. + [$f]')
  fi
done <<< "$TASK_FILES"

# --- 5. committed_files ⊆ checked_files ---
COMMITTED_NOT_CHECKED="[]"
while IFS= read -r cf; do
  [ -z "$cf" ] && continue
  if ! echo "$CHECKED_FILES" | grep -qxF "$cf"; then
    COMMITTED_NOT_CHECKED=$(echo "$COMMITTED_NOT_CHECKED" | jq --arg f "$cf" '. + [$f]')
  fi
done <<< "$COMMITTED_FILES"

# --- 판정 ---
TNC_COUNT=$(echo "$TASK_NOT_COMMITTED" | jq 'length')
CNC_COUNT=$(echo "$COMMITTED_NOT_CHECKED" | jq 'length')

if [ "$TNC_COUNT" -eq 0 ] && [ "$CNC_COUNT" -eq 0 ]; then
  FINAL_STATUS="pass"
  log_info "Gate E-post PASS"
else
  FINAL_STATUS="fail"
  if [ "$TNC_COUNT" -gt 0 ]; then
    log_error "태스크 파일 중 커밋 누락: ${TNC_COUNT}개"
  fi
  if [ "$CNC_COUNT" -gt 0 ]; then
    log_error "커밋 파일 중 검증 누락: ${CNC_COUNT}개"
  fi
fi

# --- cross-validation.json 생성 ---
TASK_FILES_JSON=$(jq -r '.files // []' "$TASK_JSON")
COMMITTED_JSON=$(echo "$COMMITTED_FILES" | jq -R -s 'split("\n") | map(select(. != ""))')
CHECKED_JSON=$(echo "$CHECKED_FILES" | jq -R -s 'split("\n") | map(select(. != ""))')

EVIDENCE=$(jq -n \
  --arg source "script" \
  --arg generator "cross-validate.sh" \
  --arg ts "$(timestamp)" \
  --arg status "$FINAL_STATUS" \
  --arg task_id "$TASK_ID" \
  --arg verification_mode "$VERIFICATION_MODE" \
  --arg resolved_commit_sha "$COMMIT_SHA" \
  --argjson task_files "$TASK_FILES_JSON" \
  --argjson committed_files "$COMMITTED_JSON" \
  --argjson checked_files "$CHECKED_JSON" \
  --argjson task_not_committed "$TASK_NOT_COMMITTED" \
  --argjson committed_not_checked "$COMMITTED_NOT_CHECKED" \
  '{
    source: $source,
    generator: $generator,
    timestamp: $ts,
    status: $status,
    task_id: $task_id,
    verification_mode: $verification_mode,
    resolved_commit_sha: (if $resolved_commit_sha == "" then null else $resolved_commit_sha end),
    chains: {
      task_files: $task_files,
      committed_files: $committed_files,
      checked_files: $checked_files
    },
    violations: {
      task_not_committed: $task_not_committed,
      committed_not_checked: $committed_not_checked
    }
  }')

write_evidence "${OUTPUT_DIR}/cross-validation.json" "$EVIDENCE"
log_info "증거 파일 생성: ${OUTPUT_DIR}/cross-validation.json"

echo "$EVIDENCE" | jq '.'

if [ "$FINAL_STATUS" = "fail" ]; then
  exit 1
fi
exit 0
