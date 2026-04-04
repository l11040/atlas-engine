#!/bin/bash
# UserPromptSubmit 훅: /atlas 슬래시 커맨드 실행 시 세션 시작 마커를 기록한다.
# prompt가 /atlas로 시작하는 경우만 처리한다.

set -e

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_DIR}/lib/db.sh"

INPUT=$(cat)

PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""')

# /atlas 커맨드가 아니면 무시
if [[ "$PROMPT" != /atlas* ]]; then
  exit 0
fi

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
CWD=$(echo "$INPUT" | jq -r '.cwd // "unknown"')
# /atlas 이후의 인자를 추출 (예: "GRID-2 --force")
ARGS=$(echo "$PROMPT" | sed 's|^/atlas[[:space:]]*||')
TIMESTAMP=$(date '+%Y-%m-%dT%H:%M:%S%z')

# JSONL 기록
LOG_RECORD=$(jq -n -c \
  --arg session "$SESSION_ID" \
  --arg started_at "$TIMESTAMP" \
  --arg args "$ARGS" \
  --arg cwd "$CWD" \
  '{
    session_id: $session,
    started_at: $started_at,
    args: $args,
    cwd: $cwd
  }')

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
RUN_DIR=$(ls -dt "${PROJECT_DIR}/.automation/runs/"*/ 2>/dev/null | head -1)

if [ -n "$RUN_DIR" ]; then
  mkdir -p "${RUN_DIR}/logs"
  echo "$LOG_RECORD" >> "${RUN_DIR}/logs/sessions.jsonl"
else
  FALLBACK_DIR="${PROJECT_DIR}/.claude/logs/sessions"
  mkdir -p "$FALLBACK_DIR"
  echo "$LOG_RECORD" >> "${FALLBACK_DIR}/$(date '+%Y-%m-%d').jsonl"
fi

# SQLite 기록
db_insert_session "$SESSION_ID" "$TIMESTAMP" "$ARGS" "$CWD"

exit 0
