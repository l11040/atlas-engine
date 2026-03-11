#!/usr/bin/env bash
# 목적: /analyze 완료 후 산출물 스키마 검증 + 증거 파일 생성
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ATLAS_ROOT="${SCRIPT_DIR}/../.."
source "${ATLAS_ROOT}/scripts/common.sh"

load_env

EVIDENCE_DIR="${AUTOMATION_PATH}/evidence"
EVIDENCE_FILE="${EVIDENCE_DIR}/analyze.validated.json"
START_TIME=$(now_ms)

mkdir -p "$EVIDENCE_DIR"

# 목적: 인자로 전달된 티켓 키 확인
TICKET_KEY="${1:-}"
if [ -z "$TICKET_KEY" ]; then
  log_error "티켓 키가 필요합니다. Usage: post-analyze.sh <TICKET_KEY>"
  exit 1
fi

TICKET_DIR="${AUTOMATION_PATH}/tickets/${TICKET_KEY}"
TICKET_FILE="${TICKET_DIR}/ticket.json"
GRAPH_FILE="${TICKET_DIR}/dependency-graph.json"

OUTPUTS="[]"
ERRORS=0

# ── 헬퍼: 검증 결과를 OUTPUTS 배열에 추가 ──
add_output() {
  local file="$1" schema="$2" valid="$3" error="${4:-}"
  if [ -n "$error" ]; then
    OUTPUTS=$(echo "$OUTPUTS" | jq --arg f "$file" --arg s "$schema" --argjson v "$valid" --arg e "$error" \
      '. + [{"file": $f, "schema": $s, "valid": $v, "error": $e}]')
  else
    OUTPUTS=$(echo "$OUTPUTS" | jq --arg f "$file" --arg s "$schema" --argjson v "$valid" \
      '. + [{"file": $f, "schema": $s, "valid": $v}]')
  fi
}

# ── 헬퍼: 단일 파일 검증 ──
validate_file() {
  local file="$1" schema="$2"
  if [ ! -f "$file" ]; then
    log_error "${schema}: file not found — $file"
    add_output "$file" "$schema" "false" "File not found"
    ERRORS=$((ERRORS + 1))
    return
  fi
  local result
  if result=$(validate_json "$schema" "$file" 2>&1); then
    add_output "$file" "$schema" "true"
  else
    log_error "${schema} 검증 실패: $result"
    add_output "$file" "$schema" "false" "$result"
    ERRORS=$((ERRORS + 1))
  fi
}

# 목적: 1단계 - ticket.json 검증
validate_file "$TICKET_FILE" "jira-ticket"

# 목적: 2단계 - dependency-graph.json 검증
validate_file "$GRAPH_FILE" "dependency-graph"

# 목적: 3단계 - 모든 tasks/*/meta/task.json 검증
TASK_COUNT=0
for task_file in "${AUTOMATION_PATH}"/tasks/TASK-*/meta/task.json; do
  [ -f "$task_file" ] || continue
  validate_file "$task_file" "task-meta"
  TASK_COUNT=$((TASK_COUNT + 1))
done

if [ "$TASK_COUNT" -eq 0 ]; then
  log_error "Task가 하나도 생성되지 않았습니다."
  add_output "${AUTOMATION_PATH}/tasks/" "task-meta" "false" "No tasks found"
  ERRORS=$((ERRORS + 1))
fi

END_TIME=$(now_ms)
DURATION=$(( END_TIME - START_TIME ))

# 목적: 증거 파일 생성
if [ "$ERRORS" -gt 0 ]; then
  STATUS="failed"
else
  STATUS="validated"
fi

jq -n \
  --arg step "analyze" \
  --arg status "$STATUS" \
  --arg validated_at "$(now_iso)" \
  --argjson outputs "$OUTPUTS" \
  --argjson duration "$DURATION" \
  '{step: $step, status: $status, validated_at: $validated_at, outputs: $outputs, duration_ms: $duration}' \
  > "$EVIDENCE_FILE"

if [ "$ERRORS" -gt 0 ]; then
  log_error "post-analyze: $ERRORS 검증 에러 → ${EVIDENCE_FILE}"
  exit 1
fi

log_info "post-analyze: ${TASK_COUNT}개 Task + ticket + graph 검증 통과 → ${EVIDENCE_FILE}"
