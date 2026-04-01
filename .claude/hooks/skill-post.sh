#!/bin/bash
# PostToolUse(Skill) 훅: 스킬 실행 로그를 기록한다.
# run_dir이 존재하면 {run_dir}/logs/skills.jsonl에, 없으면 .claude/logs/skills/에 기록.

set -e

INPUT=$(cat)

SKILL_NAME=$(echo "$INPUT" | jq -r '.tool_input.skill // "unknown"')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
CWD=$(echo "$INPUT" | jq -r '.cwd // "unknown"')
ARGS=$(echo "$INPUT" | jq -r '.tool_input.args // ""')
TOOL_RESPONSE=$(echo "$INPUT" | jq -r '.tool_response // ""')

# Pre 마커에서 시작 시간과 invocation_id 읽기
MARKER_DIR="/tmp/atlas-skill-markers"
MARKER_FILE=$(ls -t "${MARKER_DIR}/"*"_${SKILL_NAME}.json" 2>/dev/null | head -1)

START_TIMESTAMP=$(date '+%Y-%m-%dT%H:%M:%S%z')
INVOCATION_ID=$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -c1-8)

if [ -n "$MARKER_FILE" ] && [ -f "$MARKER_FILE" ]; then
  START_TIMESTAMP=$(jq -r '.start_time' "$MARKER_FILE")
  INVOCATION_ID=$(jq -r '.invocation_id' "$MARKER_FILE")
  rm -f "$MARKER_FILE"
fi

END_TIMESTAMP=$(date '+%Y-%m-%dT%H:%M:%S%z')
EPOCH=$(date '+%s')
START_EPOCH=$(date -j -f '%Y-%m-%dT%H:%M:%S%z' "$START_TIMESTAMP" '+%s' 2>/dev/null || echo "$EPOCH")
DURATION=$(( EPOCH - START_EPOCH ))

# 로그 레코드 생성
LOG_RECORD=$(jq -n -c \
  --arg skill "$SKILL_NAME" \
  --arg args "$ARGS" \
  --arg session "$SESSION_ID" \
  --arg invocation_id "$INVOCATION_ID" \
  --arg cwd "$CWD" \
  --arg start "$START_TIMESTAMP" \
  --arg end "$END_TIMESTAMP" \
  --argjson duration "$DURATION" \
  --arg response "$TOOL_RESPONSE" \
  '{
    skill: $skill,
    args: $args,
    session_id: $session,
    invocation_id: $invocation_id,
    cwd: $cwd,
    start_time: $start,
    end_time: $end,
    duration_sec: $duration,
    result: ($response | if length > 500 then .[0:500] + "..." else . end)
  }')

# run_dir 탐색: 가장 최근 run_dir의 logs/에 append
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
RUN_DIR=$(ls -dt "${PROJECT_DIR}/.automation/runs/"*/ 2>/dev/null | head -1)

if [ -n "$RUN_DIR" ] && [ -d "${RUN_DIR}/logs" ]; then
  echo "$LOG_RECORD" >> "${RUN_DIR}/logs/skills.jsonl"
else
  # 폴백: .claude/logs/skills/
  FALLBACK_DIR="${PROJECT_DIR}/.claude/logs/skills"
  mkdir -p "$FALLBACK_DIR"
  echo "$LOG_RECORD" >> "${FALLBACK_DIR}/$(date '+%Y-%m-%d').jsonl"
fi

exit 0
