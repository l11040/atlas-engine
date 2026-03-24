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

# 목적: 입력 JSON을 convention-check.schema.json에 맞게 정규화하여 저장한다
# 주의: 서브에이전트가 임의 구조로 전달해도 필수 필드를 보장한다
echo "$RESULTS" | jq --arg ts "$TIMESTAMP" --arg tid "$TASK_ID" '
  # type 필드 강제
  .type = "convention_check" |
  # task_id 강제
  .task_id = $tid |
  # skills_applied 기본값 보장
  .skills_applied = (.skills_applied // []) |
  # checks 배열 정규화 — 각 항목에 필수 필드 보장
  .checks = ((.checks // []) | map(
    {
      id: (.id // "UNKNOWN"),
      rule: (.rule // .item // .description // "unknown"),
      status: (.status // (.result // "SKIP") | ascii_upcase),
      evidence: (.evidence // .line_ref // .detail // "N/A"),
      fix_hint: (.fix_hint // null)
    } | if .fix_hint == null then del(.fix_hint) else . end
  )) |
  # summary 보장
  .summary = (
    if .summary then .summary
    else
      { total: (.checks | length),
        pass: ([.checks[] | select(.status == "PASS")] | length),
        fail: ([.checks[] | select(.status == "FAIL")] | length),
        skip: ([.checks[] | select(.status == "SKIP")] | length),
        pass_rate: (
          if (.checks | length) > 0
          then "\((([.checks[] | select(.status == "PASS")] | length) * 1000 / (.checks | length) | . / 10))%"
          else "100.0%"
          end
        )
      }
    end
  ) |
  # timestamp 추가
  .timestamp = $ts |
  # additionalProperties 제거 — 스키마에 정의된 필드만 유지
  {type, task_id, skills_applied, checks, summary, timestamp}
' > "${EVIDENCE_DIR}/convention-check.json"

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
