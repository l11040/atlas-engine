#!/bin/bash
# PreToolUse(Skill) 훅: 스킬 시작 시간 마커를 생성한다.

set -e

INPUT=$(cat)

SKILL_NAME=$(echo "$INPUT" | jq -r '.tool_input.skill // "unknown"')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
TIMESTAMP=$(date '+%Y-%m-%dT%H:%M:%S%z')
INVOCATION_ID=$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -c1-8)

MARKER_DIR="/tmp/atlas-skill-markers"
mkdir -p "$MARKER_DIR"

jq -n \
  --arg skill "$SKILL_NAME" \
  --arg session "$SESSION_ID" \
  --arg timestamp "$TIMESTAMP" \
  --arg invocation_id "$INVOCATION_ID" \
  '{
    skill: $skill,
    session_id: $session,
    start_time: $timestamp,
    invocation_id: $invocation_id
  }' > "${MARKER_DIR}/${INVOCATION_ID}_${SKILL_NAME}.json"

exit 0
