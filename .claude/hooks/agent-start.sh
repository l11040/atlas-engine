#!/bin/bash
# SubagentStart 훅: 에이전트 시작 시간 마커를 생성한다.
# 입력: agent_id, agent_type, session_id

set -e

INPUT=$(cat)

AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // "unknown"')
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // "unknown"')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
TIMESTAMP=$(date '+%Y-%m-%dT%H:%M:%S%z')

MARKER_DIR="/tmp/atlas-agent-markers"
mkdir -p "$MARKER_DIR"

jq -n \
  --arg agent_id "$AGENT_ID" \
  --arg agent_type "$AGENT_TYPE" \
  --arg session "$SESSION_ID" \
  --arg timestamp "$TIMESTAMP" \
  '{
    agent_id: $agent_id,
    agent_type: $agent_type,
    session_id: $session,
    start_time: $timestamp
  }' > "${MARKER_DIR}/${AGENT_ID}.json"

exit 0
