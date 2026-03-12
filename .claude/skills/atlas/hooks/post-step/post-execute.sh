#!/usr/bin/env bash
# 목적: /execute 완료 후 모든 Task 산출물 스키마 검증 + 증거 파일 생성
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
EVIDENCE_FILE="${EVIDENCE_DIR}/execute.validated.json"
START_TIME=$(now_ms)

mkdir -p "$EVIDENCE_DIR"

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

COMPLETED_COUNT=0
FAILED_COUNT=0
TOTAL_COUNT=0

# 목적: 1단계 - 모든 Task의 status.json 검증 + 상태 집계
for status_file in "${RUN_DIR}"/tasks/TASK-*/state/status.json; do
  [ -f "$status_file" ] || continue
  validate_file "$status_file" "task-status"
  TOTAL_COUNT=$((TOTAL_COUNT + 1))

  TASK_STATUS=$(jq -r '.status' "$status_file" 2>/dev/null)
  case "$TASK_STATUS" in
    COMPLETED) COMPLETED_COUNT=$((COMPLETED_COUNT + 1)) ;;
    FAILED|SKIPPED) FAILED_COUNT=$((FAILED_COUNT + 1)) ;;
    *)
      log_error "Task가 최종 상태가 아닙니다: $status_file (status=$TASK_STATUS)"
      add_output "$status_file" "task-status:final-state" "false" "Expected COMPLETED/FAILED/SKIPPED, got $TASK_STATUS"
      ERRORS=$((ERRORS + 1))
      ;;
  esac
done

if [ "$TOTAL_COUNT" -eq 0 ]; then
  log_error "Task가 하나도 없습니다."
  add_output "${RUN_DIR}/tasks/" "task-status" "false" "No tasks found"
  ERRORS=$((ERRORS + 1))
fi

# 목적: 2단계 - COMPLETED Task의 artifacts.json 검증
for task_dir in "${RUN_DIR}"/tasks/TASK-*/; do
  [ -d "$task_dir" ] || continue
  local_status_file="${task_dir}state/status.json"
  [ -f "$local_status_file" ] || continue

  TASK_STATUS=$(jq -r '.status' "$local_status_file" 2>/dev/null)
  if [ "$TASK_STATUS" = "COMPLETED" ]; then
    artifacts_file="${task_dir}artifacts/artifacts.json"
    validate_file "$artifacts_file" "task-artifacts"

    # 목적: artifacts.json의 files가 비어있지 않은지 확인
    FILE_COUNT=$(jq '.files | length' "$artifacts_file" 2>/dev/null || echo "0")
    if [ "$FILE_COUNT" -eq 0 ]; then
      log_error "COMPLETED Task의 artifacts가 비어있습니다: $artifacts_file"
      add_output "$artifacts_file" "task-artifacts:non-empty" "false" "COMPLETED task has empty artifacts"
      ERRORS=$((ERRORS + 1))
    fi

    # 목적: git.json 존재 확인
    git_file="${task_dir}state/git.json"
    if [ ! -f "$git_file" ]; then
      log_error "COMPLETED Task에 git.json이 없습니다: $git_file"
      add_output "$git_file" "git-info" "false" "File not found"
      ERRORS=$((ERRORS + 1))
    fi
  fi
done

# 목적: 3단계 - COMPLETED Task의 validation-result.json 검증
for task_dir in "${RUN_DIR}"/tasks/TASK-*/; do
  [ -d "$task_dir" ] || continue
  local_status_file="${task_dir}state/status.json"
  [ -f "$local_status_file" ] || continue

  TASK_STATUS=$(jq -r '.status' "$local_status_file" 2>/dev/null)
  if [ "$TASK_STATUS" = "COMPLETED" ]; then
    validation_file="${task_dir}validation/validation-result.json"
    if [ ! -f "$validation_file" ]; then
      log_error "COMPLETED Task에 validation-result.json이 없습니다: $validation_file"
      add_output "$validation_file" "validation-result" "false" "File not found"
      ERRORS=$((ERRORS + 1))
    else
      PASSED=$(jq -r '.passed' "$validation_file" 2>/dev/null)
      if [ "$PASSED" != "true" ]; then
        log_error "COMPLETED Task의 검증이 통과하지 않았습니다: $validation_file"
        add_output "$validation_file" "validation-result:passed" "false" "passed=$PASSED"
        ERRORS=$((ERRORS + 1))
      else
        add_output "$validation_file" "validation-result" "true"
      fi
    fi
  fi
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
  --arg step "execute" \
  --arg status "$STATUS" \
  --arg validated_at "$(now_iso)" \
  --argjson outputs "$OUTPUTS" \
  --argjson duration "$DURATION" \
  --argjson completed "$COMPLETED_COUNT" \
  --argjson failed "$FAILED_COUNT" \
  --argjson total "$TOTAL_COUNT" \
  '{step: $step, status: $status, validated_at: $validated_at, outputs: $outputs, duration_ms: $duration, summary: {completed: $completed, failed: $failed, total: $total}}' \
  > "$EVIDENCE_FILE"

if [ "$ERRORS" -gt 0 ]; then
  log_error "post-execute: $ERRORS 검증 에러 → ${EVIDENCE_FILE}"
  exit 1
fi

log_info "post-execute: ${COMPLETED_COUNT}/${TOTAL_COUNT} Task 완료 검증 통과 → ${EVIDENCE_FILE}"
