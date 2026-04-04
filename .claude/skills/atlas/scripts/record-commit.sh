#!/bin/bash
# record-commit.sh — 태스크별 커밋 증거 파일(commit.json)을 생성한다.
#
# Usage:
#   record-commit.sh <task-id> <run-dir> <project-root> [commit-sha]
#   record-commit.sh <task.json> <evidence-dir> <project-root> [commit-sha]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

require_jq

if [ "$#" -lt 3 ]; then
  echo "Usage: record-commit.sh <task-id> <run-dir> <project-root> [commit-sha]" >&2
  exit 2
fi

if [ -f "$1" ]; then
  TASK_JSON="$1"
  OUTPUT_DIR="$2"
  PROJECT_ROOT="$3"
  COMMIT_SHA="${4:-}"
else
  TASK_ID="$1"
  RUN_DIR="$2"
  PROJECT_ROOT="$3"
  COMMIT_SHA="${4:-}"
  TASK_JSON="${RUN_DIR}/tasks/${TASK_ID}.json"
  OUTPUT_DIR="${RUN_DIR}/evidence/${TASK_ID}"
fi

if ! validate_json_file "$TASK_JSON" "task.json"; then
  exit 2
fi

mkdir -p "$OUTPUT_DIR"

TASK_ID=$(jq -r '.task_id // "unknown"' "$TASK_JSON")

cd "$PROJECT_ROOT"
if [ -z "$COMMIT_SHA" ]; then
  COMMIT_SHA=$(git rev-parse HEAD)
fi

COMMITTED_FILES=$(git diff-tree --root --no-commit-id --name-only -r "$COMMIT_SHA" 2>/dev/null | sort || true)
COMMITTED_JSON=$(echo "$COMMITTED_FILES" | jq -R -s 'split("\n") | map(select(. != ""))')

EVIDENCE=$(jq -n \
  --arg source "script" \
  --arg generator "record-commit.sh" \
  --arg ts "$(timestamp)" \
  --arg task_id "$TASK_ID" \
  --arg commit_sha "$COMMIT_SHA" \
  --argjson committed_files "$COMMITTED_JSON" \
  '{
    source: $source,
    generator: $generator,
    timestamp: $ts,
    task_id: $task_id,
    commit_sha: $commit_sha,
    committed_files: $committed_files
  }')

write_evidence "${OUTPUT_DIR}/commit.json" "$EVIDENCE"
log_info "증거 파일 생성: ${OUTPUT_DIR}/commit.json"
echo "$EVIDENCE" | jq '.'
