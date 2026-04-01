#!/bin/bash
# completion-gate.sh — Stop Hook
# 현재 단계의 게이트 증거가 존재하지 않으면 응답을 차단한다.
# 증거 없이 다음 단계로 넘어가는 것을 방지하는 안전장치.

set -euo pipefail

RUN_DIR="${ATLAS_RUN_DIR:-}"

# run_dir이 없으면 Atlas 파이프라인이 아님 — 통과
if [ -z "$RUN_DIR" ] || [ ! -d "$RUN_DIR" ]; then
  exit 0
fi

PHASE_CTX="${RUN_DIR}/phase-context.json"

# phase-context.json이 없으면 통과
if [ ! -f "$PHASE_CTX" ]; then
  exit 0
fi

CURRENT_PHASE=$(jq -r '.pipeline.current_phase' "$PHASE_CTX")

# 단계별 필수 증거 파일 정의
check_evidence() {
  local phase="$1"
  local missing=()

  case "$phase" in
    setup)
      # Gate 0: setup-summary.json이 존재하고 status=pass여야 함
      local summary="${RUN_DIR}/setup-summary.json"
      if [ ! -f "$summary" ]; then
        missing+=("setup-summary.json")
      elif [ "$(jq -r '.status' "$summary")" != "pass" ]; then
        missing+=("setup-summary.json (status != pass)")
      fi
      ;;
    learn)
      local conv="${RUN_DIR}/conventions.json"
      local conv_val="${RUN_DIR}/evidence/learn/conventions-validation.json"
      [ ! -f "$conv" ] && missing+=("conventions.json")
      [ ! -f "$conv_val" ] && missing+=("conventions-validation.json")
      ;;
    analyze)
      local tasks_val="${RUN_DIR}/evidence/analyze/tasks-validation.json"
      [ ! -f "$tasks_val" ] && missing+=("tasks-validation.json")
      ;;
    execute)
      local current_task
      current_task=$(jq -r '.tasks.current // empty' "$PHASE_CTX")
      if [ -n "$current_task" ]; then
        local task_evidence="${RUN_DIR}/evidence/${current_task}"
        local validate="${task_evidence}/validate.json"
        local convention="${task_evidence}/convention-check.json"
        [ ! -f "$validate" ] && missing+=("${current_task}/validate.json")
        [ ! -f "$convention" ] && missing+=("${current_task}/convention-check.json")
      fi
      ;;
    audit)
      local audit_check="${RUN_DIR}/evidence/audit/audit-check.json"
      local audit_reval="${RUN_DIR}/evidence/audit/audit-revalidation.json"
      [ ! -f "$audit_check" ] && missing+=("audit-check.json")
      [ ! -f "$audit_reval" ] && missing+=("audit-revalidation.json")
      ;;
  esac

  if [ ${#missing[@]} -gt 0 ]; then
    echo "BLOCKED: ${phase} 단계 증거 누락 — ${missing[*]}"
    echo "해당 단계의 게이트를 통과해야 다음으로 진행할 수 있습니다."
    exit 2
  fi
}

check_evidence "$CURRENT_PHASE"
exit 0
