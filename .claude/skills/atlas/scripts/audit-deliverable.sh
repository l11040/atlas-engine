#!/bin/bash
# audit-deliverable.sh — Gate AU: 전체 deliverable 타입 교차 검증
#
# Usage: audit-deliverable.sh <run-dir> [project-root]
#
# 모든 태스크가 완료된 후, 전체 결과물이 소스 티켓의 요구사항을
# 아키텍처적으로 충족하는지 검증한다.
#
# 검증:
#   AU-1: 프로필별 deliverable 타입 존재 (api → Controller, batch → JobConfig)
#   AU-2: AC 체크리스트 전수 집계 (전체 태스크의 ac-checklist.json 합산)
#   AU-3: 커밋 파일 vs 태스크 파일 전체 일관성
#
# 결과: audit-deliverable.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

require_jq

# --- 인자 파싱 ---
RUN_DIR="${1:?Usage: audit-deliverable.sh <run-dir> [project-root]}"
PROJECT_ROOT="${2:-.}"

TASKS_DIR="${RUN_DIR}/tasks"
TICKETS_DIR="${RUN_DIR}/tickets"
SETUP_EVIDENCE="${RUN_DIR}/evidence/setup"
EXECUTE_EVIDENCE="${RUN_DIR}/evidence/execute"
OUTPUT_DIR="${RUN_DIR}/evidence/audit"

mkdir -p "$OUTPUT_DIR"

log_info "Gate AU 감사 시작"

# --- 태스크 파일 수집 ---
TASK_FILES=()
for f in "${TASKS_DIR}"/task-*.json; do
  [ -f "$f" ] || continue
  TASK_FILES+=("$f")
done

if [ ${#TASK_FILES[@]} -eq 0 ]; then
  log_error "태스크 파일 없음"
  exit 2
fi

# ============================================================
# AU-1: 프로필별 deliverable 타입 존재
# ============================================================
log_info "AU-1 프로필별 deliverable 검증..."

AU1_ERRORS="[]"

# 프로필별 필수 패턴
PROFILE_PATTERNS_API='Controller\.java$|Adapter\.java$|controller/|adapter/'
PROFILE_PATTERNS_BATCH='JobConfig\.java$|BatchConfig\.java$|batch/.*Config\.java$'

# 전체 태스크의 모든 files[] 수집
ALL_TASK_FILES=""
for f in "${TASK_FILES[@]}"; do
  files=$(jq -r '.files // [] | .[]' "$f" 2>/dev/null)
  ALL_TASK_FILES="${ALL_TASK_FILES}${files}"$'\n'
done

# 전체 커밋 파일 수집 (main 대비)
cd "$PROJECT_ROOT"
MAIN_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")
ALL_COMMITTED=$(git diff --name-only "${MAIN_BRANCH}...HEAD" 2>/dev/null || git diff --name-only HEAD~"${#TASK_FILES[@]}"..HEAD 2>/dev/null || true)

# 티켓 프로필 수집
declare -A TICKET_PROFILES
if [ -d "$SETUP_EVIDENCE" ]; then
  for evidence_dir in "${SETUP_EVIDENCE}"/*/; do
    [ -d "$evidence_dir" ] || continue
    sv_file="${evidence_dir}source-validation.json"
    [ -f "$sv_file" ] || continue
    ticket_key=$(jq -r '.ticket_key // ""' "$sv_file" 2>/dev/null)
    profile=$(jq -r '.profile // "default"' "$sv_file" 2>/dev/null)
    if [ -n "$ticket_key" ]; then
      TICKET_PROFILES["$ticket_key"]="$profile"
    fi
  done
fi

# 프로필별 deliverable 존재 확인 (커밋 파일 기준)
HAS_API_TICKET=false
HAS_BATCH_TICKET=false

for ticket_key in "${!TICKET_PROFILES[@]}"; do
  profile="${TICKET_PROFILES[$ticket_key]}"
  case "$profile" in
    api) HAS_API_TICKET=true ;;
    batch) HAS_BATCH_TICKET=true ;;
  esac
done

if [ "$HAS_API_TICKET" = "true" ]; then
  api_count=$(echo "$ALL_COMMITTED" | grep -cE "$PROFILE_PATTERNS_API" || true)
  if [ "$api_count" -eq 0 ]; then
    AU1_ERRORS=$(echo "$AU1_ERRORS" | jq '. + ["API 프로필 티켓이 있지만 커밋된 Controller/Adapter 파일이 없습니다"]')
  else
    log_info "AU-1 API: Controller/Adapter ${api_count}개 확인"
  fi
fi

if [ "$HAS_BATCH_TICKET" = "true" ]; then
  batch_count=$(echo "$ALL_COMMITTED" | grep -cE "$PROFILE_PATTERNS_BATCH" || true)
  if [ "$batch_count" -eq 0 ]; then
    AU1_ERRORS=$(echo "$AU1_ERRORS" | jq '. + ["Batch 프로필 티켓이 있지만 커밋된 JobConfig/BatchConfig 파일이 없습니다"]')
  else
    log_info "AU-1 Batch: JobConfig ${batch_count}개 확인"
  fi
fi

AU1_COUNT=$(echo "$AU1_ERRORS" | jq 'length')
if [ "$AU1_COUNT" -eq 0 ]; then
  AU1_STATUS="pass"
  log_info "AU-1 PASS"
else
  AU1_STATUS="fail"
  log_error "AU-1 FAIL — ${AU1_COUNT}건"
fi

# ============================================================
# AU-2: AC 체크리스트 전수 집계
# ============================================================
log_info "AU-2 AC 체크리스트 전수 집계..."

AU2_ERRORS="[]"
TOTAL_AC=0
IMPLEMENTED_AC=0
MISSING_CHECKLIST_TASKS="[]"

for f in "${TASK_FILES[@]}"; do
  tid=$(jq -r '.task_id // "unknown"' "$f")
  task_ac_count=$(jq '.acceptance_criteria // [] | length' "$f" 2>/dev/null || echo 0)
  TOTAL_AC=$((TOTAL_AC + task_ac_count))

  checklist_file="${EXECUTE_EVIDENCE}/${tid}/ac-checklist.json"
  if [ -f "$checklist_file" ]; then
    impl_count=$(jq '[.checklist // [] | .[] | select(.status == "implemented")] | length' "$checklist_file" 2>/dev/null || echo 0)
    IMPLEMENTED_AC=$((IMPLEMENTED_AC + impl_count))

    not_impl=$(jq --arg tid "$tid" '[.checklist // [] | .[] | select(.status != "implemented" and .status != "not_applicable") | "\($tid): \(.ac)"]' "$checklist_file" 2>/dev/null || echo "[]")
    not_impl_count=$(echo "$not_impl" | jq 'length')
    if [ "$not_impl_count" -gt 0 ]; then
      AU2_ERRORS=$(echo "$AU2_ERRORS" | jq --argjson items "$not_impl" '. + $items')
    fi
  else
    MISSING_CHECKLIST_TASKS=$(echo "$MISSING_CHECKLIST_TASKS" | jq --arg t "$tid" '. + [$t]')
  fi
done

MISSING_CL_COUNT=$(echo "$MISSING_CHECKLIST_TASKS" | jq 'length')
if [ "$MISSING_CL_COUNT" -gt 0 ]; then
  AU2_ERRORS=$(echo "$AU2_ERRORS" | jq --argjson tasks "$MISSING_CHECKLIST_TASKS" '. + [("ac-checklist.json 미생성 태스크: " + ($tasks | join(", ")))]')
fi

AU2_ERR_COUNT=$(echo "$AU2_ERRORS" | jq 'length')
if [ "$AU2_ERR_COUNT" -eq 0 ]; then
  AU2_STATUS="pass"
  log_info "AU-2 PASS — ${IMPLEMENTED_AC}/${TOTAL_AC} AC implemented"
else
  AU2_STATUS="fail"
  log_error "AU-2 FAIL — ${IMPLEMENTED_AC}/${TOTAL_AC} AC implemented, ${AU2_ERR_COUNT}건 문제"
fi

# ============================================================
# AU-3: 커밋 파일 vs 태스크 파일 전체 일관성
# ============================================================
log_info "AU-3 파일 일관성 검증..."

AU3_ERRORS="[]"

# 태스크에 명시되었지만 커밋되지 않은 파일
ALL_TASK_FILES_SORTED=$(for f in "${TASK_FILES[@]}"; do jq -r '.files // [] | .[]' "$f" 2>/dev/null; done | sort -u)
ALL_COMMITTED_SORTED=$(echo "$ALL_COMMITTED" | sort -u)

TASK_NOT_IN_COMMIT="[]"
while IFS= read -r tf; do
  [ -z "$tf" ] && continue
  if ! echo "$ALL_COMMITTED_SORTED" | grep -qxF "$tf"; then
    TASK_NOT_IN_COMMIT=$(echo "$TASK_NOT_IN_COMMIT" | jq --arg f "$tf" '. + [$f]')
  fi
done <<< "$ALL_TASK_FILES_SORTED"

TNIC_COUNT=$(echo "$TASK_NOT_IN_COMMIT" | jq 'length')
if [ "$TNIC_COUNT" -gt 0 ]; then
  AU3_ERRORS=$(echo "$AU3_ERRORS" | jq --argjson files "$TASK_NOT_IN_COMMIT" '. + [("태스크에 명시되었지만 커밋 안 된 파일: " + ($files | join(", ")))]')
fi

AU3_ERR_COUNT=$(echo "$AU3_ERRORS" | jq 'length')
if [ "$AU3_ERR_COUNT" -eq 0 ]; then
  AU3_STATUS="pass"
  log_info "AU-3 PASS"
else
  AU3_STATUS="fail"
  log_error "AU-3 FAIL — ${AU3_ERR_COUNT}건"
fi

# ============================================================
# 최종 판정
# ============================================================
if [ "$AU1_STATUS" = "pass" ] && [ "$AU2_STATUS" = "pass" ] && [ "$AU3_STATUS" = "pass" ]; then
  FINAL_STATUS="pass"
  log_info "Gate AU PASS"
else
  FINAL_STATUS="fail"
  log_error "Gate AU FAIL"
fi

# --- audit-deliverable.json 생성 ---
EVIDENCE=$(jq -n \
  --arg source "script" \
  --arg generator "audit-deliverable.sh" \
  --arg ts "$(timestamp)" \
  --arg status "$FINAL_STATUS" \
  --arg au1_status "$AU1_STATUS" \
  --argjson au1_errors "$AU1_ERRORS" \
  --arg au2_status "$AU2_STATUS" \
  --argjson total_ac "$TOTAL_AC" \
  --argjson implemented_ac "$IMPLEMENTED_AC" \
  --argjson au2_errors "$AU2_ERRORS" \
  --argjson missing_checklist_tasks "$MISSING_CHECKLIST_TASKS" \
  --arg au3_status "$AU3_STATUS" \
  --argjson au3_errors "$AU3_ERRORS" \
  '{
    source: $source,
    generator: $generator,
    timestamp: $ts,
    status: $status,
    sub_gates: {
      AU1_deliverable_type: { status: $au1_status, errors: $au1_errors },
      AU2_ac_coverage: {
        status: $au2_status,
        total_ac: $total_ac,
        implemented_ac: $implemented_ac,
        missing_checklist_tasks: $missing_checklist_tasks,
        errors: $au2_errors
      },
      AU3_file_consistency: { status: $au3_status, errors: $au3_errors }
    }
  }')

write_evidence "${OUTPUT_DIR}/audit-deliverable.json" "$EVIDENCE"
log_info "증거 파일 생성: ${OUTPUT_DIR}/audit-deliverable.json"

echo "$EVIDENCE" | jq '.'

if [ "$FINAL_STATUS" = "fail" ]; then
  exit 1
fi
exit 0
