#!/bin/bash
# SubagentStart 훅: 에이전트 시작 즉시 SQLite에 로그 레코드를 생성한다.

set -e

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_DIR}/lib/db.sh"

INPUT=$(cat)

AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // "unknown"')
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // "unknown"')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
CWD=$(echo "$INPUT" | jq -r '.cwd // "unknown"')
PERMISSION_MODE=$(echo "$INPUT" | jq -r '.permission_mode // "unknown"')
TIMESTAMP=$(date '+%Y-%m-%dT%H:%M:%S%z')

# 목적: 시작 즉시 SQLite에 레코드를 INSERT한다. end_time/duration은 stop 훅에서 UPDATE로 채운다.
db_start_agent_log "$SESSION_ID" "$AGENT_ID" "$AGENT_TYPE" "$CWD" "$PERMISSION_MODE" "$TIMESTAMP"

exit 0
