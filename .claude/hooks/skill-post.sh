#!/bin/bash
# PostToolUse(Skill) 훅: 스킬 실행 로그를 기록한다.
# run_dir이 존재하면 {run_dir}/logs/skills.jsonl에, 없으면 .claude/logs/skills/에 기록.

set -e

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_DIR}/lib/db.sh"

INPUT=$(cat)

SKILL_NAME=$(echo "$INPUT" | jq -r '.tool_input.skill // "unknown"')
SKILL_ARGS=$(echo "$INPUT" | jq -r '.tool_input.args // ""')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
CWD=$(echo "$INPUT" | jq -r '.cwd // "unknown"')
PERMISSION_MODE=$(echo "$INPUT" | jq -r '.permission_mode // "unknown"')
TOOL_USE_ID=$(echo "$INPUT" | jq -r '.tool_use_id // "unknown"')
TOOL_RESPONSE=$(echo "$INPUT" | jq -r '.tool_response // ""')

# 서브에이전트 컨텍스트 정보 (있으면 기록)
AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // null')
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // null')

# Pre 마커에서 시작 시간 읽기
MARKER_DIR="/tmp/atlas-skill-markers"
MARKER_FILE="${MARKER_DIR}/${TOOL_USE_ID}.json"

START_TIMESTAMP=$(date '+%Y-%m-%dT%H:%M:%S%z')

if [ -f "$MARKER_FILE" ]; then
  START_TIMESTAMP=$(jq -r '.start_time' "$MARKER_FILE")
  rm -f "$MARKER_FILE"
fi

END_TIMESTAMP=$(date '+%Y-%m-%dT%H:%M:%S%z')
EPOCH=$(date '+%s')
START_EPOCH=$(date -j -f '%Y-%m-%dT%H:%M:%S%z' "$START_TIMESTAMP" '+%s' 2>/dev/null || echo "$EPOCH")
DURATION=$(( EPOCH - START_EPOCH ))

CHILD_AGENT_ID=$(echo "$TOOL_RESPONSE" | jq -r '.agentId // (fromjson? | .agentId) // empty' 2>/dev/null || true)
CHILD_STATUS=$(echo "$TOOL_RESPONSE" | jq -r '.status // (fromjson? | .status) // empty' 2>/dev/null || true)

# JSONL 기록
LOG_RECORD=$(jq -n -c \
  --arg skill "$SKILL_NAME" \
  --arg args "$SKILL_ARGS" \
  --arg session "$SESSION_ID" \
  --arg tool_use_id "$TOOL_USE_ID" \
  --arg cwd "$CWD" \
  --arg permission_mode "$PERMISSION_MODE" \
  --arg agent_id "$AGENT_ID" \
  --arg agent_type "$AGENT_TYPE" \
  --arg start "$START_TIMESTAMP" \
  --arg end "$END_TIMESTAMP" \
  --argjson duration "$DURATION" \
  --arg response "$TOOL_RESPONSE" \
  --arg child_agent_id "$CHILD_AGENT_ID" \
  --arg child_status "$CHILD_STATUS" \
  '{
    log_schema_version: 2,
    skill: $skill,
    args: $args,
    session_id: $session,
    tool_use_id: $tool_use_id,
    cwd: $cwd,
    permission_mode: $permission_mode,
    caller: (if $agent_id != "null" then {agent_id: $agent_id, agent_type: $agent_type} else "orchestrator" end),
    start_time: $start,
    end_time: $end,
    duration_sec: $duration,
    child_agent_id: (if $child_agent_id == "" then null else $child_agent_id end),
    child_status: (if $child_status == "" then null else $child_status end),
    result: $response
  }')

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
RUN_DIR=$(ls -dt "${PROJECT_DIR}/.automation/runs/"*/ 2>/dev/null | head -1)

if [ -n "$RUN_DIR" ]; then
  mkdir -p "${RUN_DIR}/logs"
  echo "$LOG_RECORD" >> "${RUN_DIR}/logs/skills.jsonl"
else
  FALLBACK_DIR="${PROJECT_DIR}/.claude/logs/skills"
  mkdir -p "$FALLBACK_DIR"
  echo "$LOG_RECORD" >> "${FALLBACK_DIR}/$(date '+%Y-%m-%d').jsonl"
fi

# SQLite 기록
CALLER_AGENT_ID=""
CALLER_AGENT_TYPE=""
if [ "$AGENT_ID" != "null" ]; then
  CALLER_AGENT_ID="$AGENT_ID"
  CALLER_AGENT_TYPE="$AGENT_TYPE"
fi
db_start_skill_log "$SESSION_ID" "$TOOL_USE_ID" "$SKILL_NAME" "$SKILL_ARGS" "$CWD" "$PERMISSION_MODE" "$CALLER_AGENT_ID" "$CALLER_AGENT_TYPE" "$START_TIMESTAMP"
db_finish_skill_log "$TOOL_USE_ID" "$END_TIMESTAMP" "$DURATION" "$TOOL_RESPONSE"

exit 0
