#!/usr/bin/env bash
# record-convention-evidence.sh — convention-check 결과를 evidence JSON으로 기록
# 사용법: bash record-convention-evidence.sh --run-dir DIR --task-id ID --results 'JSON'

set -euo pipefail

RUN_DIR=""
TASK_ID=""
RESULTS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run-dir)  RUN_DIR="$2"; shift 2 ;;
    --task-id)  TASK_ID="$2"; shift 2 ;;
    --results)  RESULTS="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$RUN_DIR" || -z "$TASK_ID" || -z "$RESULTS" ]]; then
  echo "Usage: record-convention-evidence.sh --run-dir DIR --task-id ID --results 'JSON'" >&2
  exit 1
fi

EVIDENCE_DIR="${RUN_DIR}/evidence/execute/task-${TASK_ID}"
mkdir -p "$EVIDENCE_DIR"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# results JSON에 timestamp 추가하여 저장
echo "$RESULTS" | jq --arg ts "$TIMESTAMP" '. + {timestamp: $ts}' \
  > "${EVIDENCE_DIR}/convention-check.json"

# 요약 출력
PASS_COUNT=$(echo "$RESULTS" | jq -r '.summary.pass // 0')
FAIL_COUNT=$(echo "$RESULTS" | jq -r '.summary.fail // 0')
TOTAL=$(echo "$RESULTS" | jq -r '.summary.total // 0')
PASS_RATE=$(echo "$RESULTS" | jq -r '.summary.pass_rate // 0')

echo "Convention Check Evidence Recorded:"
echo "  Task: ${TASK_ID}"
echo "  Total: ${TOTAL}, Pass: ${PASS_COUNT}, Fail: ${FAIL_COUNT}"
echo "  Pass Rate: ${PASS_RATE}"
echo "  Evidence: ${EVIDENCE_DIR}/convention-check.json"

# FAIL이 있으면 exit 1 (completion-gate에서 감지)
if [[ "$FAIL_COUNT" -gt 0 ]]; then
  echo ""
  echo "⚠ ${FAIL_COUNT} convention violation(s) found."
  echo "Failing checks:"
  echo "$RESULTS" | jq -r '.checks[] | select(.status == "FAIL") | "  [\(.id)] \(.rule): \(.evidence) → \(.fix_hint // "수동 수정 필요")"'
  exit 1
fi

exit 0
