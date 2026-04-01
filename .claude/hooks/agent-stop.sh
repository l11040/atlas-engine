#!/bin/bash
# SubagentStop 훅: 에이전트 실행 로그를 기록한다.
# 입력: agent_id, agent_type, agent_transcript_path, last_assistant_message

set -e

INPUT=$(cat)

AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // "unknown"')
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // "unknown"')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
CWD=$(echo "$INPUT" | jq -r '.cwd // "unknown"')
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.agent_transcript_path // ""')
LAST_MESSAGE=$(echo "$INPUT" | jq -r '.last_assistant_message // ""')

# Pre 마커에서 시작 시간 읽기
MARKER_DIR="/tmp/atlas-agent-markers"
MARKER_FILE="${MARKER_DIR}/${AGENT_ID}.json"

START_TIMESTAMP=$(date '+%Y-%m-%dT%H:%M:%S%z')

if [ -f "$MARKER_FILE" ]; then
  START_TIMESTAMP=$(jq -r '.start_time' "$MARKER_FILE")
  rm -f "$MARKER_FILE"
fi

END_TIMESTAMP=$(date '+%Y-%m-%dT%H:%M:%S%z')
EPOCH=$(date '+%s')
START_EPOCH=$(date -j -f '%Y-%m-%dT%H:%M:%S%z' "$START_TIMESTAMP" '+%s' 2>/dev/null || echo "$EPOCH")
DURATION=$(( EPOCH - START_EPOCH ))

LOG_RECORD=$(jq -n -c \
  --arg agent_id "$AGENT_ID" \
  --arg agent_type "$AGENT_TYPE" \
  --arg session "$SESSION_ID" \
  --arg cwd "$CWD" \
  --arg start "$START_TIMESTAMP" \
  --arg end "$END_TIMESTAMP" \
  --argjson duration "$DURATION" \
  --arg transcript "$TRANSCRIPT_PATH" \
  --arg last_message "$LAST_MESSAGE" \
  '{
    agent_id: $agent_id,
    agent_type: $agent_type,
    session_id: $session,
    cwd: $cwd,
    start_time: $start,
    end_time: $end,
    duration_sec: $duration,
    transcript_path: $transcript,
    last_message: ($last_message | if length > 500 then .[0:500] + "..." else . end)
  }')

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
RUN_DIR=$(ls -dt "${PROJECT_DIR}/.automation/runs/"*/ 2>/dev/null | head -1)

if [ -n "$RUN_DIR" ] && [ -d "${RUN_DIR}/logs" ]; then
  echo "$LOG_RECORD" >> "${RUN_DIR}/logs/agents.jsonl"
else
  FALLBACK_DIR="${PROJECT_DIR}/.claude/logs/agents"
  mkdir -p "$FALLBACK_DIR"
  echo "$LOG_RECORD" >> "${FALLBACK_DIR}/$(date '+%Y-%m-%d').jsonl"
fi

exit 0
