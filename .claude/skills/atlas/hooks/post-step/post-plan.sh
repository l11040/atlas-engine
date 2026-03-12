#!/usr/bin/env bash
# 목적: /plan 완료 후 execution-plan.json 스키마 검증 + 증거 파일 생성
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
EVIDENCE_FILE="${EVIDENCE_DIR}/plan.validated.json"
START_TIME=$(now_ms)

mkdir -p "$EVIDENCE_DIR"

PLAN_FILE="${RUN_DIR}/execution-plan.json"

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

# 목적: 1단계 - execution-plan.json 스키마 검증
validate_file "$PLAN_FILE" "execution-plan"

# 목적: 2단계 - total_tasks와 실제 Task 수 일치 확인
if [ -f "$PLAN_FILE" ]; then
  PLAN_TOTAL=$(jq -r '.total_tasks' "$PLAN_FILE" 2>/dev/null)
  WAVE_TASK_COUNT=$(jq '[.waves[].task_ids | length] | add' "$PLAN_FILE" 2>/dev/null)
  ACTUAL_TASK_COUNT=$(find "${RUN_DIR}/tasks" -name "task.json" -path "*/meta/*" 2>/dev/null | wc -l | tr -d ' ')

  if [ "$PLAN_TOTAL" != "$WAVE_TASK_COUNT" ]; then
    log_error "total_tasks($PLAN_TOTAL)와 Wave 내 Task 수($WAVE_TASK_COUNT)가 불일치합니다."
    add_output "$PLAN_FILE" "execution-plan:consistency" "false" "total_tasks=$PLAN_TOTAL but wave tasks=$WAVE_TASK_COUNT"
    ERRORS=$((ERRORS + 1))
  fi

  if [ "$PLAN_TOTAL" != "$ACTUAL_TASK_COUNT" ]; then
    log_error "total_tasks($PLAN_TOTAL)와 실제 Task 파일 수($ACTUAL_TASK_COUNT)가 불일치합니다."
    add_output "$PLAN_FILE" "execution-plan:completeness" "false" "total_tasks=$PLAN_TOTAL but actual=$ACTUAL_TASK_COUNT"
    ERRORS=$((ERRORS + 1))
  fi

  # 목적: 3단계 - Wave 내 각 task_id가 실제 Task 디렉토리에 존재하는지 확인
  ALL_TASK_IDS=$(jq -r '[.waves[].task_ids[]] | .[]' "$PLAN_FILE" 2>/dev/null)
  for task_id in $ALL_TASK_IDS; do
    TASK_META="${RUN_DIR}/tasks/${task_id}/meta/task.json"
    if [ ! -f "$TASK_META" ]; then
      log_error "Wave에 배치된 ${task_id}의 Task 디렉토리가 존재하지 않습니다: ${TASK_META}"
      add_output "$PLAN_FILE" "execution-plan:task-exists" "false" "Task ${task_id} directory not found"
      ERRORS=$((ERRORS + 1))
    fi
  done

  # 목적: 4단계 - 중복 배치 확인 (하나의 Task가 여러 Wave에 있으면 안 됨)
  DUPLICATE_COUNT=$(jq '[.waves[].task_ids[]] | group_by(.) | map(select(length > 1)) | length' "$PLAN_FILE" 2>/dev/null)
  if [ "$DUPLICATE_COUNT" != "0" ]; then
    log_error "동일 Task가 여러 Wave에 중복 배치되었습니다."
    add_output "$PLAN_FILE" "execution-plan:no-duplicates" "false" "$DUPLICATE_COUNT duplicate task(s)"
    ERRORS=$((ERRORS + 1))
  fi
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
  --arg step "plan" \
  --arg status "$STATUS" \
  --arg validated_at "$(now_iso)" \
  --argjson outputs "$OUTPUTS" \
  --argjson duration "$DURATION" \
  '{step: $step, status: $status, validated_at: $validated_at, outputs: $outputs, duration_ms: $duration}' \
  > "$EVIDENCE_FILE"

if [ "$ERRORS" -gt 0 ]; then
  log_error "post-plan: $ERRORS 검증 에러 → ${EVIDENCE_FILE}"
  exit 1
fi

log_info "post-plan: execution-plan.json 검증 통과 → ${EVIDENCE_FILE}"
