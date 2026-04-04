#!/bin/bash
# SubagentStop 훅: 시작 시 INSERT된 레코드를 end_time/duration/결과로 UPDATE한다.

set -e

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_DIR}/lib/db.sh"

INPUT=$(cat)

AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // "unknown"')
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // "unknown"')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
CWD=$(echo "$INPUT" | jq -r '.cwd // "unknown"')
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.agent_transcript_path // ""')
LAST_MESSAGE=$(echo "$INPUT" | jq -r '.last_assistant_message // ""')

END_TIMESTAMP=$(date '+%Y-%m-%dT%H:%M:%S%z')
END_EPOCH=$(date '+%s')

# 목적: start 훅이 INSERT한 레코드에서 start_time을 읽어 duration을 계산한다.
START_TIMESTAMP=$(db_exec "SELECT start_time FROM hook_agent_logs WHERE agent_id='${AGENT_ID}' LIMIT 1;" 2>/dev/null || echo "")
if [ -n "$START_TIMESTAMP" ]; then
  START_EPOCH=$(date -j -f '%Y-%m-%dT%H:%M:%S%z' "$START_TIMESTAMP" '+%s' 2>/dev/null || echo "$END_EPOCH")
else
  START_EPOCH=$END_EPOCH
  START_TIMESTAMP=$END_TIMESTAMP
fi
DURATION=$(( END_EPOCH - START_EPOCH ))

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
RUN_DIR=$(ls -dt "${PROJECT_DIR}/.automation/runs/"*/ 2>/dev/null | head -1)
AGENT_LOG_FILE=""
SNAPSHOT_SEQ=1

if [ -n "$RUN_DIR" ]; then
  AGENT_LOG_FILE="${RUN_DIR}/logs/agents.jsonl"
else
  AGENT_LOG_FILE="${PROJECT_DIR}/.claude/logs/agents/$(date '+%Y-%m-%d').jsonl"
fi

if [ -f "$AGENT_LOG_FILE" ]; then
  PREV_COUNT=$(jq -r --arg agent_id "$AGENT_ID" 'select(.agent_id == $agent_id) | .agent_id' "$AGENT_LOG_FILE" 2>/dev/null | wc -l | tr -d ' ')
  if [ -n "$PREV_COUNT" ]; then
    SNAPSHOT_SEQ=$(( PREV_COUNT + 1 ))
  fi
fi

# 목적: SQLite 레코드를 UPDATE해 종료 정보를 채운다.
db_finish_agent_log "$AGENT_ID" "$END_TIMESTAMP" "$DURATION" "$TRANSCRIPT_PATH" "$LAST_MESSAGE"

# 목적: JSONL에도 완성된 레코드를 기록한다.
LOG_RECORD=$(jq -n -c \
  --arg agent_id "$AGENT_ID" \
  --arg agent_type "$AGENT_TYPE" \
  --arg session "$SESSION_ID" \
  --arg cwd "$CWD" \
  --arg start "$START_TIMESTAMP" \
  --arg end "$END_TIMESTAMP" \
  --argjson duration "$DURATION" \
  --arg event_kind "stop_snapshot" \
  --argjson snapshot_seq "$SNAPSHOT_SEQ" \
  --arg transcript "$TRANSCRIPT_PATH" \
  --arg last_message "$LAST_MESSAGE" \
  '{
    log_schema_version: 2,
    agent_id: $agent_id,
    agent_type: $agent_type,
    session_id: $session,
    cwd: $cwd,
    start_time: $start,
    end_time: $end,
    duration_sec: $duration,
    event_kind: $event_kind,
    snapshot_seq: $snapshot_seq,
    transcript_path: $transcript,
    last_message: $last_message
  }')

if [ -n "$RUN_DIR" ]; then
  mkdir -p "${RUN_DIR}/logs"
  echo "$LOG_RECORD" >> "${RUN_DIR}/logs/agents.jsonl"
else
  FALLBACK_DIR="${PROJECT_DIR}/.claude/logs/agents"
  mkdir -p "$FALLBACK_DIR"
  echo "$LOG_RECORD" >> "${FALLBACK_DIR}/$(date '+%Y-%m-%d').jsonl"
fi

exit 0
