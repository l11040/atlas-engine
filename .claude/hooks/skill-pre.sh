#!/bin/bash
# PreToolUse(Skill) 훅: 스킬 시작 시간 마커를 생성한다.
# 세션 시작 기록은 UserPromptSubmit(/atlas) 훅이 담당한다.

set -e

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_DIR}/lib/db.sh"

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
TOOL_USE_ID=$(echo "$INPUT" | jq -r '.tool_use_id // "unknown"')
SKILL_NAME=$(echo "$INPUT" | jq -r '.tool_input.skill // "unknown"')
SKILL_ARGS=$(echo "$INPUT" | jq -r '.tool_input.args // ""')
CWD=$(echo "$INPUT" | jq -r '.cwd // "unknown"')
PERMISSION_MODE=$(echo "$INPUT" | jq -r '.permission_mode // "unknown"')
CALLER_AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // ""')
CALLER_AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // ""')
TIMESTAMP=$(date '+%Y-%m-%dT%H:%M:%S%z')

# SQLite 기록
db_start_skill_log \
  "$SESSION_ID" \
  "$TOOL_USE_ID" \
  "$SKILL_NAME" \
  "$SKILL_ARGS" \
  "$CWD" \
  "$PERMISSION_MODE" \
  "$CALLER_AGENT_ID" \
  "$CALLER_AGENT_TYPE" \
  "$TIMESTAMP"

# 스킬 시작 마커 생성
MARKER_DIR="/tmp/atlas-skill-markers"
mkdir -p "$MARKER_DIR"

jq -n \
  --arg skill "$SKILL_NAME" \
  --arg session "$SESSION_ID" \
  --arg tool_use_id "$TOOL_USE_ID" \
  --arg timestamp "$TIMESTAMP" \
  '{
    skill: $skill,
    session_id: $session,
    tool_use_id: $tool_use_id,
    start_time: $timestamp
  }' > "${MARKER_DIR}/${TOOL_USE_ID}.json"

exit 0
