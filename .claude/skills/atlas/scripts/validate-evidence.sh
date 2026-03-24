#!/usr/bin/env bash
# 목적: Task별 evidence 파일의 스키마 준수 + 필수 파일 존재를 검증한다
# 주의: macOS bash 3.2 호환 (declare -A 미사용)
# 사용법:
#   bash validate-evidence.sh --run-dir DIR --task-id ID [--fix-residual]
#   bash validate-evidence.sh --run-dir DIR --all [--fix-residual]
#
# 종료 코드:
#   0 — 모든 검증 통과
#   1 — 검증 실패 (상세는 stdout)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RUN_DIR=""
TASK_ID=""
ALL=false
FIX_RESIDUAL=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-dir)       RUN_DIR="$2"; shift 2 ;;
    --task-id)       TASK_ID="$2"; shift 2 ;;
    --all)           ALL=true; shift ;;
    --fix-residual)  FIX_RESIDUAL=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$RUN_DIR" ]]; then
  echo "ERROR: --run-dir 필수" >&2
  exit 1
fi

if [[ "$ALL" = false && -z "$TASK_ID" ]]; then
  echo "ERROR: --task-id 또는 --all 필수" >&2
  exit 1
fi

# ── 필수 evidence 파일 목록 ──
REQUIRED_FILES="convention-check.json validate.json redteam-summary.json status-done.json commit.json"

# ── lookup 함수 (bash 3.2 호환) ──
get_required_fields() {
  case "$1" in
    convention-check.json)   echo "type task_id skills_applied checks summary timestamp" ;;
    validate.json)           echo "type script status taxonomy task_id exit_code timestamp" ;;
    validate.error.json)     echo "type script task_id exit_code timestamp" ;;
    redteam-summary.json)    echo "type task_id layers total_fixes timestamp" ;;
    status-done.json|status-pending.json|status-in_progress.json|status-failed.json)
                             echo "type task_id transition reason timestamp" ;;
    commit.json)             echo "type task_id commit_hash message files timestamp" ;;
    generate.json)           echo "type action timestamp" ;;
    redteam-*.json)          echo "type target layer checks timestamp" ;;
    *)                       echo "" ;;
  esac
}

get_expected_type() {
  case "$1" in
    convention-check.json)   echo "convention_check" ;;
    validate.json)           echo "validate_result" ;;
    validate.error.json)     echo "script_error" ;;
    redteam-summary.json)    echo "redteam_summary" ;;
    status-done.json|status-pending.json|status-in_progress.json|status-failed.json)
                             echo "status_change" ;;
    commit.json)             echo "commit" ;;
    generate.json)           echo "llm_decision" ;;
    redteam-*.json)          echo "redteam" ;;
    *)                       echo "" ;;
  esac
}

TOTAL_CHECKS=0
TOTAL_PASS=0
TOTAL_FAIL=0
FAILURE_LOG=""

check_pass() {
  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  TOTAL_PASS=$((TOTAL_PASS + 1))
}

check_fail() {
  local msg="$1"
  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  TOTAL_FAIL=$((TOTAL_FAIL + 1))
  FAILURE_LOG="${FAILURE_LOG}  ✗ ${msg}\n"
}

# ── required 필드 + type 값 검증 ──
validate_required_fields() {
  local file="$1" required_str="$2" label="$3" expected_type="${4:-}"

  # JSON 유효성
  if ! jq empty "$file" 2>/dev/null; then
    check_fail "${label}: 유효하지 않은 JSON"
    return
  fi

  # required 필드 존재
  local missing=""
  for field in $required_str; do
    if ! jq -e --arg f "$field" 'has($f)' "$file" >/dev/null 2>&1; then
      missing="${missing} ${field}"
    fi
  done

  if [[ -n "$missing" ]]; then
    check_fail "${label}: 필수 필드 누락 →${missing}"
  else
    check_pass
  fi

  # type 필드 값 검증
  if [[ -n "$expected_type" ]]; then
    local actual_type
    actual_type=$(jq -r '.type // ""' "$file" 2>/dev/null)
    if [[ "$actual_type" != "$expected_type" ]]; then
      check_fail "${label}: type 불일치 (expected=${expected_type}, actual=${actual_type})"
    else
      check_pass
    fi
  fi
}

# ── 단일 Task 검증 ──
validate_task() {
  local task_id="$1"
  local evidence_dir="${RUN_DIR}/evidence/execute/task-${task_id}"

  if [[ ! -d "$evidence_dir" ]]; then
    check_fail "task-${task_id}: evidence 디렉토리 없음"
    return
  fi

  # 1. 필수 파일 존재 검증
  for file in $REQUIRED_FILES; do
    if [[ -f "${evidence_dir}/${file}" ]]; then
      check_pass
    else
      if [[ "$file" == "validate.json" && -f "${evidence_dir}/validate.error.json" ]]; then
        check_pass
      elif [[ "$file" == "redteam-summary.json" && -f "${evidence_dir}/redteam-skip.json" ]]; then
        check_pass
      else
        check_fail "task-${task_id}: 필수 파일 누락 → ${file}"
      fi
    fi
  done

  # 2. 잔여 status 파일 검증
  if [[ -f "${evidence_dir}/status-done.json" && -f "${evidence_dir}/status-in_progress.json" ]]; then
    if [[ "$FIX_RESIDUAL" = true ]]; then
      rm -f "${evidence_dir}/status-in_progress.json"
      check_pass
      echo "  [FIX] task-${task_id}: status-in_progress.json 삭제"
    else
      check_fail "task-${task_id}: 잔여 status-in_progress.json (status-done.json과 공존)"
    fi
  fi

  # 3. 존재하는 파일의 스키마 준수 검증
  for filepath in "${evidence_dir}"/*.json; do
    [[ -f "$filepath" ]] || continue
    local bn
    bn=$(basename "$filepath")

    # redteam-skip.json은 검증 스킵
    [[ "$bn" == "redteam-skip.json" ]] && continue

    local required_str
    required_str=$(get_required_fields "$bn")
    [[ -z "$required_str" ]] && continue

    local expected_type
    expected_type=$(get_expected_type "$bn")

    validate_required_fields "$filepath" "$required_str" "task-${task_id}/${bn}" "$expected_type"
  done
}

# ── 실행 ──
if [[ "$ALL" = true ]]; then
  INDEX_FILE="${RUN_DIR}/tasks/index.json"
  if [[ ! -f "$INDEX_FILE" ]]; then
    echo "ERROR: index.json 없음: ${INDEX_FILE}" >&2
    exit 1
  fi
  TASK_IDS=$(jq -r '.task_ids[]' "$INDEX_FILE")
  for tid in $TASK_IDS; do
    validate_task "$tid"
  done
else
  validate_task "$TASK_ID"
fi

# ── 결과 출력 ──
echo ""
echo "=== Evidence Validation ==="
echo "Total: ${TOTAL_CHECKS}, Pass: ${TOTAL_PASS}, Fail: ${TOTAL_FAIL}"

if [[ $TOTAL_FAIL -gt 0 ]]; then
  echo ""
  echo "Failures:"
  printf "$FAILURE_LOG"
  exit 1
fi

echo "All checks passed."
exit 0
