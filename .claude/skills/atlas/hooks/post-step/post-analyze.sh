#!/usr/bin/env bash
# 목적: /analyze 완료 후 산출물 스키마 검증 + 증거 파일 생성
# 주의: RUN_DIR 환경변수가 설정되어 있어야 한다
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ATLAS_ROOT="${SCRIPT_DIR}/../.."
source "${ATLAS_ROOT}/scripts/common.sh"

load_env

# 목적: RUN_DIR 확인
if [ -z "${RUN_DIR:-}" ]; then
  log_error "RUN_DIR 환경변수가 설정되지 않았습니다."
  exit 1
fi

EVIDENCE_DIR="${RUN_DIR}/evidence"
EVIDENCE_FILE="${EVIDENCE_DIR}/analyze.validated.json"
START_TIME=$(now_ms)

mkdir -p "$EVIDENCE_DIR"

TICKETS_DIR="${RUN_DIR}/tickets"
GRAPH_FILE="${RUN_DIR}/dependency-graph.json"
REGISTRY_FILE="${RUN_DIR}/policy-registry.json"

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

# 목적: 1단계 - 계층형 티켓 트리 검증 (tickets/**/ticket.json)
TICKET_COUNT=0
if [ -d "$TICKETS_DIR" ]; then
  while IFS= read -r ticket_file; do
    [ -f "$ticket_file" ] || continue
    validate_file "$ticket_file" "jira-ticket"
    TICKET_COUNT=$((TICKET_COUNT + 1))
  done < <(find "$TICKETS_DIR" -name "ticket.json" -type f)
fi

if [ "$TICKET_COUNT" -eq 0 ]; then
  log_error "티켓 트리가 생성되지 않았습니다."
  add_output "${TICKETS_DIR}/" "jira-ticket" "false" "No ticket files found"
  ERRORS=$((ERRORS + 1))
fi

# 목적: 2단계 - dependency-graph.json 검증
validate_file "$GRAPH_FILE" "dependency-graph"

# 목적: 3단계 - policy-registry.json 검증
validate_file "$REGISTRY_FILE" "policy-registry"

# 목적: 4단계 - 모든 tasks/*/meta/task.json 검증
TASK_COUNT=0
for task_file in "${RUN_DIR}"/tasks/TASK-*/meta/task.json; do
  [ -f "$task_file" ] || continue
  validate_file "$task_file" "task-meta"
  TASK_COUNT=$((TASK_COUNT + 1))
done

if [ "$TASK_COUNT" -eq 0 ]; then
  log_error "Task가 하나도 생성되지 않았습니다."
  add_output "${RUN_DIR}/tasks/" "task-meta" "false" "No tasks found"
  ERRORS=$((ERRORS + 1))
fi

# 목적: 5단계 - 모든 tasks/*/state/status.json 검증
for status_file in "${RUN_DIR}"/tasks/TASK-*/state/status.json; do
  [ -f "$status_file" ] || continue
  validate_file "$status_file" "task-status"
done

# 목적: 6단계 - 모든 tasks/*/artifacts/artifacts.json 검증
for artifacts_file in "${RUN_DIR}"/tasks/TASK-*/artifacts/artifacts.json; do
  [ -f "$artifacts_file" ] || continue
  validate_file "$artifacts_file" "task-artifacts"
done

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

log_info "post-analyze: ${TASK_COUNT}개 Task + ${TICKET_COUNT}개 ticket + graph + policy-registry 검증 통과 → ${EVIDENCE_FILE}"
