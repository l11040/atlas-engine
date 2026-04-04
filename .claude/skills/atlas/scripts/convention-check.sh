#!/bin/bash
# convention-check.sh — Gate E-pre: 컨벤션 스킬 적용 검증
#
# Usage:
#   convention-check.sh <task.json> <evidence-dir> [project-root]
#   convention-check.sh <task-id> <run-dir> [project-root]
#
# skill-manifest.json과 required-skills.json을 기반으로:
#   1. manifest에 선택된 스킬 읽기
#   2. required skill 누락 확인
#   3. 각 스킬별 검증 스크립트 실행 (존재 시)
#   4. 결과 집계
#
# 결과: convention-check.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

require_jq

# --- 인자 파싱 ---
if [ "$#" -ge 2 ] && [ ! -f "$1" ] && [ -d "$2" ] && [ -f "${2}/tasks/${1}.json" ]; then
  TASK_ID="$1"
  RUN_DIR="$2"
  TASK_JSON="${RUN_DIR}/tasks/${TASK_ID}.json"
  EVIDENCE_DIR="${RUN_DIR}/evidence/${TASK_ID}"
  PROJECT_ROOT="${3:-.}"
else
  TASK_JSON="${1:?Usage: convention-check.sh <task.json> <evidence-dir> [project-root]}"
  EVIDENCE_DIR="${2:?Usage: convention-check.sh <task.json> <evidence-dir> [project-root]}"
  PROJECT_ROOT="${3:-.}"
fi

if ! validate_json_file "$TASK_JSON" "task.json"; then
  exit 2
fi

TASK_ID=$(jq -r '.task_id // "unknown"' "$TASK_JSON")
log_info "컨벤션 검증 시작: ${TASK_ID}"

mkdir -p "$EVIDENCE_DIR"

MANIFEST="${EVIDENCE_DIR}/skill-manifest.json"
RUN_DIR=$(dirname "$(dirname "$EVIDENCE_DIR")")
REQUIRED_SKILLS="${RUN_DIR}/required-skills.json"

# --- manifest 읽기 ---
SELECTED_SKILLS="[]"
if [ -f "$MANIFEST" ]; then
  SELECTED_SKILLS=$(jq '.selected_skills // []' "$MANIFEST")
  log_info "manifest 스킬: $(echo "$SELECTED_SKILLS" | jq -r 'join(", ")')"
else
  log_warn "skill-manifest.json 미존재 — 스킬 선택 단계가 실행되지 않음"
fi

# --- required skills 확인 ---
REQUIRED="[]"
MISSING_REQUIRED="[]"
if [ -f "$REQUIRED_SKILLS" ]; then
  REQUIRED=$(jq '.required // []' "$REQUIRED_SKILLS")

  while IFS= read -r req_skill; do
    [ -z "$req_skill" ] && continue
    found=$(echo "$SELECTED_SKILLS" | jq --arg s "$req_skill" 'any(. == $s)')
    if [ "$found" != "true" ]; then
      MISSING_REQUIRED=$(echo "$MISSING_REQUIRED" | jq --arg s "$req_skill" '. + [$s]')
      log_error "필수 스킬 누락: ${req_skill}"
    fi
  done < <(echo "$REQUIRED" | jq -r '.[]')
fi

MISSING_COUNT=$(echo "$MISSING_REQUIRED" | jq 'length')

# --- 각 스킬별 검증 스크립트 실행 ---
SKILL_RESULTS="{}"
SKILL_FAIL_COUNT=0

while IFS= read -r skill_name; do
  [ -z "$skill_name" ] && continue

  # 스킬 검증 스크립트 경로: .claude/skills/atlas/scripts/conventions/{skill_name}.sh
  SKILL_SCRIPT="${SCRIPT_DIR}/conventions/${skill_name}.sh"

  if [ -f "$SKILL_SCRIPT" ]; then
    log_info "스킬 검증: ${skill_name}"
    skill_output="${EVIDENCE_DIR}/convention-${skill_name}.json"

    if bash "$SKILL_SCRIPT" "$TASK_JSON" "$skill_output" "$PROJECT_ROOT" 2>&1; then
      SKILL_RESULTS=$(echo "$SKILL_RESULTS" | jq --arg s "$skill_name" '. + {($s): "pass"}')
    else
      SKILL_RESULTS=$(echo "$SKILL_RESULTS" | jq --arg s "$skill_name" '. + {($s): "fail"}')
      SKILL_FAIL_COUNT=$((SKILL_FAIL_COUNT + 1))
    fi
  else
    # 스크립트 없으면 PASS (검증 불가)
    SKILL_RESULTS=$(echo "$SKILL_RESULTS" | jq --arg s "$skill_name" '. + {($s): "no_script"}')
    log_warn "스킬 검증 스크립트 없음: ${skill_name}"
  fi
done < <(echo "$SELECTED_SKILLS" | jq -r '.[]')

# --- 판정 ---
if [ "$MISSING_COUNT" -eq 0 ] && [ "$SKILL_FAIL_COUNT" -eq 0 ]; then
  FINAL_STATUS="pass"
  log_info "컨벤션 검증 PASS"
else
  FINAL_STATUS="fail"
  log_error "컨벤션 검증 FAIL — 필수 누락 ${MISSING_COUNT}, 스킬 실패 ${SKILL_FAIL_COUNT}"
fi

# --- convention-check.json 생성 ---
EVIDENCE=$(jq -n \
  --arg source "script" \
  --arg generator "convention-check.sh" \
  --arg ts "$(timestamp)" \
  --arg status "$FINAL_STATUS" \
  --arg task_id "$TASK_ID" \
  --argjson selected_skills "$SELECTED_SKILLS" \
  --argjson required_skills "$REQUIRED" \
  --argjson missing_required "$MISSING_REQUIRED" \
  --argjson skill_results "$SKILL_RESULTS" \
  '{
    source: $source,
    generator: $generator,
    timestamp: $ts,
    status: $status,
    task_id: $task_id,
    selected_skills: $selected_skills,
    required_skills: $required_skills,
    missing_required: $missing_required,
    skill_results: $skill_results
  }')

write_evidence "${EVIDENCE_DIR}/convention-check.json" "$EVIDENCE"
log_info "증거 파일 생성: ${EVIDENCE_DIR}/convention-check.json"

echo "$EVIDENCE" | jq '.'

if [ "$FINAL_STATUS" = "fail" ]; then
  exit 1
fi
exit 0
