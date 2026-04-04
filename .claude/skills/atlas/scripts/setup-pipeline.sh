#!/bin/bash
# setup-pipeline.sh — Atlas v5 Setup 단계 오케스트레이터
#
# Usage: setup-pipeline.sh <ticket-key> <tickets-dir> [project-root]
#
# 1. 티켓 트리에서 대상 티켓(들) 수집
# 2. validate-source.sh로 각 리프 티켓 Gate 0 검증
# 3. 자동화 전용 브랜치 생성
# 4. run_dir 생성 + phase-context.json 초기화
# 5. 결과 요약 출력

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

require_jq

# --- 인자 파싱 ---
TICKET_KEY="${1:?Usage: setup-pipeline.sh <ticket-key> <tickets-dir> [project-root]}"
TICKETS_DIR="${2:?Usage: setup-pipeline.sh <ticket-key> <tickets-dir> [project-root]}"
PROJECT_ROOT="${3:-.}"

# --- 경로 설정 ---
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
RUN_DIR="${PROJECT_ROOT}/.automation/runs/${TICKET_KEY}-${TIMESTAMP}"
EVIDENCE_DIR="${RUN_DIR}/evidence/setup"
BRANCH_NAME="atlas/${TICKET_KEY}"

log_info "=== Atlas v5 Setup 시작 ==="
log_info "티켓: ${TICKET_KEY}"
log_info "Run dir: ${RUN_DIR}"

# --- run_dir 생성 ---
mkdir -p "${EVIDENCE_DIR}"
mkdir -p "${RUN_DIR}/tasks"

# --- 리프 티켓 수집 (subtask가 없는 티켓) ---
collect_leaf_tickets() {
  local dir="$1"
  local tickets=()

  # dir 내 모든 JSON 파일을 순회
  while IFS= read -r -d '' file; do
    local subtasks
    subtasks=$(jq -r '.subtasks // [] | length' "$file" 2>/dev/null || echo "0")
    if [ "$subtasks" -eq 0 ]; then
      tickets+=("$file")
    fi
  done < <(find "$dir" -name "*.json" -not -name "_*.json" -not -name "tree.json" -not -name "index.json" -print0)

  printf '%s\n' "${tickets[@]}"
}

# 대상 티켓 디렉토리 결정
if [ -d "${TICKETS_DIR}/${TICKET_KEY}" ]; then
  TICKET_DIR="${TICKETS_DIR}/${TICKET_KEY}"
elif [ -f "${TICKETS_DIR}/${TICKET_KEY}.json" ]; then
  # 단일 티켓 파일
  TICKET_DIR=""
else
  log_error "티켓 ${TICKET_KEY}를 찾을 수 없습니다: ${TICKETS_DIR}"
  exit 1
fi

# 리프 티켓 수집
LEAF_TICKETS=()
if [ -n "$TICKET_DIR" ]; then
  while IFS= read -r ticket; do
    [ -n "$ticket" ] && LEAF_TICKETS+=("$ticket")
  done < <(collect_leaf_tickets "$TICKET_DIR")
else
  LEAF_TICKETS=("${TICKETS_DIR}/${TICKET_KEY}.json")
fi

TOTAL_TICKETS=${#LEAF_TICKETS[@]}
log_info "검증 대상 리프 티켓: ${TOTAL_TICKETS}개"

# --- Gate 0 검증 (각 리프 티켓) ---
PASS_COUNT=0
FAIL_COUNT=0
RESULTS="[]"

for ticket_file in "${LEAF_TICKETS[@]}"; do
  ticket_key=$(jq -r '.key' "$ticket_file")
  ticket_evidence_dir="${EVIDENCE_DIR}/${ticket_key}"
  mkdir -p "$ticket_evidence_dir"

  log_info "--- Gate 0: ${ticket_key} ---"

  if bash "${SCRIPT_DIR}/validate-source.sh" "$ticket_file" "$ticket_evidence_dir" 2>&1; then
    PASS_COUNT=$((PASS_COUNT + 1))
    result_status="pass"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    result_status="fail"
  fi

  RESULTS=$(echo "$RESULTS" | jq \
    --arg key "$ticket_key" \
    --arg status "$result_status" \
    --arg file "$ticket_file" \
    '. + [{"ticket_key": $key, "status": $status, "source_file": $file}]')
done

# --- 자동화 브랜치 생성 (Gate 0 전체 PASS 시에만) ---
BRANCH_CREATED=false
if [ "$FAIL_COUNT" -eq 0 ]; then
  log_info "Gate 0 전체 PASS — 자동화 브랜치 생성"

  cd "$PROJECT_ROOT"
  if git rev-parse --verify "$BRANCH_NAME" &>/dev/null; then
    log_warn "브랜치 ${BRANCH_NAME}이 이미 존재합니다"
    BRANCH_CREATED=true
  else
    if git checkout -b "$BRANCH_NAME" 2>/dev/null; then
      BRANCH_CREATED=true
      log_info "브랜치 생성: ${BRANCH_NAME}"
    else
      log_warn "브랜치 생성 실패 (git 상태 확인 필요)"
    fi
  fi
else
  log_error "Gate 0 FAIL 티켓이 있어 브랜치를 생성하지 않습니다"
fi

# --- source.json 복사 (run_dir에 확정본 보관) ---
if [ "$FAIL_COUNT" -eq 0 ]; then
  mkdir -p "${RUN_DIR}/tickets"
  for ticket_file in "${LEAF_TICKETS[@]}"; do
    ticket_key=$(jq -r '.key' "$ticket_file")
    cp "$ticket_file" "${RUN_DIR}/tickets/${ticket_key}.json"
  done
  log_info "확정된 티켓 ${TOTAL_TICKETS}개를 run_dir에 복사"
fi

# --- phase-context.json 초기화 ---
PHASE_CONTEXT=$(jq -n \
  --arg ticket_key "$TICKET_KEY" \
  --arg run_dir "$RUN_DIR" \
  --arg phase "setup" \
  --argjson total "$TOTAL_TICKETS" \
  '{
    pipeline: {
      ticket_key: $ticket_key,
      run_dir: $run_dir,
      current_phase: $phase,
      completed_phases: []
    },
    tasks: {
      total: $total,
      completed: [],
      current: null,
      remaining: []
    },
    artifacts: {
      source_json: "tickets/",
      conventions: null,
      current_task_file: null,
      latest_evidence: "evidence/setup/"
    },
    ralp_state: {
      current_retry: 0,
      max_retry: 3,
      last_gate_feedback: null
    }
  }')

write_evidence "${RUN_DIR}/phase-context.json" "$PHASE_CONTEXT"

# --- 전체 요약 생성 ---
SETUP_STATUS="pass"
if [ "$FAIL_COUNT" -gt 0 ]; then
  SETUP_STATUS="fail"
fi

SUMMARY=$(jq -n \
  --arg source "script" \
  --arg generator "setup-pipeline.sh" \
  --arg ts "$(timestamp)" \
  --arg status "$SETUP_STATUS" \
  --arg ticket_key "$TICKET_KEY" \
  --arg run_dir "$RUN_DIR" \
  --arg branch "$BRANCH_NAME" \
  --argjson branch_created "$BRANCH_CREATED" \
  --argjson total "$TOTAL_TICKETS" \
  --argjson pass "$PASS_COUNT" \
  --argjson fail "$FAIL_COUNT" \
  --argjson results "$RESULTS" \
  '{
    source: $source,
    generator: $generator,
    timestamp: $ts,
    status: $status,
    ticket_key: $ticket_key,
    run_dir: $run_dir,
    branch: $branch,
    branch_created: $branch_created,
    gate0_summary: {
      total: $total,
      pass: $pass,
      fail: $fail,
      results: $results
    }
  }')

write_evidence "${RUN_DIR}/setup-summary.json" "$SUMMARY"

# --- 결과 출력 ---
echo ""
log_info "=== Setup 결과 ==="
log_info "상태: ${SETUP_STATUS}"
log_info "Gate 0: ${PASS_COUNT}/${TOTAL_TICKETS} PASS"
if [ "$FAIL_COUNT" -gt 0 ]; then
  log_error "FAIL: ${FAIL_COUNT}개 — source.json 보완 필요"
  echo "$RESULTS" | jq -r '.[] | select(.status == "fail") | "  - \(.ticket_key)"'
fi
log_info "Run dir: ${RUN_DIR}"
echo ""

echo "$SUMMARY" | jq '.'

if [ "$SETUP_STATUS" = "fail" ]; then
  exit 1
fi
exit 0
