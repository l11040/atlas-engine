#!/usr/bin/env bash
# 목적: LLM이 응답을 끝내려 할 때 증거 게이트로 작동 (RALP 강제)
# 트리거: Stop
# 출력: decision: "block" + systemMessage 또는 exit 0
# 주의: ATLAS_ACTIVE + ATLAS_CURRENT_TASK가 설정된 경우에만 작동

# atlas 실행 중이 아니면 패스
if [ -z "${ATLAS_ACTIVE:-}" ]; then
  exit 0
fi

RUN_DIR="${ATLAS_RUN_DIR:-}"
TASK_ID="${ATLAS_CURRENT_TASK:-}"

# execute 단계가 아니면 패스 (learn/analyze/audit에서는 게이트 없음)
if [ -z "$RUN_DIR" ] || [ -z "$TASK_ID" ]; then
  exit 0
fi

# ── 무한 루프 방지 ──
RETRY_COUNT="${ATLAS_RETRY_COUNT:-0}"
MAX_RETRY=5

if [ "$RETRY_COUNT" -ge "$MAX_RETRY" ]; then
  # 최대 재시도 초과 — 에스컬레이션 (block 해제하여 LLM이 실패 처리 가능)
  jq -n --arg task "$TASK_ID" --arg count "$RETRY_COUNT" '{
    additionalContext: ("ESCALATION: Task " + $task + " failed after " + $count + " RALP retries. Mark this task as failed using: update_task_status \"$RUN_DIR\" \"" + $task + "\" \"failed\" \"" + $count + "회 RALP 재시도 실패\" and move to the next task.")
  }'
  exit 0
fi

EVIDENCE_DIR="${RUN_DIR}/evidence/execute/task-${TASK_ID}"

# ── Gate 1: validate.json 존재 확인 ──
VALIDATE_FILE="${EVIDENCE_DIR}/validate.json"
if [ ! -f "$VALIDATE_FILE" ]; then
  jq -n --arg task "$TASK_ID" '{
    decision: "block",
    reason: "validate.sh not executed",
    systemMessage: ("GATE BLOCKED: Task " + $task + " — validate.sh를 아직 실행하지 않았습니다. validate.sh를 실행하세요.")
  }'
  exit 0
fi

# ── Gate 2: validate 결과 확인 + Failure Taxonomy 피드백 ──
STATUS=$(jq -r '.status // "unknown"' "$VALIDATE_FILE" 2>/dev/null)
EXIT_CODE=$(jq -r '.exit_code // -1' "$VALIDATE_FILE" 2>/dev/null)

if [ "$STATUS" != "pass" ]; then
  OUTPUT=$(jq -r '.output_tail // .stderr // ""' "$VALIDATE_FILE" 2>/dev/null)
  TAXONOMY=$(jq -r '.taxonomy // "unknown"' "$VALIDATE_FILE" 2>/dev/null)
  GATE_FAILED=$(jq -r '.gate_failed // "unknown"' "$VALIDATE_FILE" 2>/dev/null)

  case "$TAXONOMY" in
    scope_violation)
      MSG="SCOPE VIOLATION: 허용되지 않은 파일을 수정했습니다. 위반 파일은 자동으로 되돌려졌습니다. scope 내 파일만 수정하세요."
      ;;
    compile_error)
      MSG="BUILD FAILED:\n${OUTPUT}\n\n빌드 에러를 수정하세요."
      ;;
    lint_violation)
      MSG="LINT FAILED:\n${OUTPUT}\n\n린트 위반을 수정하세요."
      ;;
    domain_lint)
      MSG="DOMAIN LINT FAILED:\n${OUTPUT}\n\nconventions.json의 domain_lint 규칙을 확인하고 수정하세요."
      ;;
    *)
      MSG="VALIDATE FAILED (taxonomy: ${TAXONOMY}, gate: ${GATE_FAILED}):\n${OUTPUT}"
      ;;
  esac

  jq -n --arg task "$TASK_ID" --arg msg "$MSG" --arg tax "$TAXONOMY" '{
    decision: "block",
    reason: ("validate failed: " + $tax),
    systemMessage: ("GATE BLOCKED [" + $tax + "]: Task " + $task + "\n" + $msg + "\n\n이전 validate 결과를 삭제하고(rm validate.json validate.error.json) 에러를 수정한 후 validate.sh를 다시 실행하세요.")
  }'
  exit 0
fi

# ── Gate 3: 레드팀 증거 확인 ──
REDTEAM_FILE="${EVIDENCE_DIR}/redteam-summary.json"
REDTEAM_SKIP="${EVIDENCE_DIR}/redteam-skip.json"

if [ ! -f "$REDTEAM_FILE" ] && [ ! -f "$REDTEAM_SKIP" ]; then
  jq -n --arg task "$TASK_ID" '{
    decision: "block",
    reason: "redteam not executed",
    systemMessage: ("GATE BLOCKED: Task " + $task + " — 레드팀 검증이 아직 실행되지 않았습니다. 레드팀 검증을 수행하세요.")
  }'
  exit 0
fi

# ── 모든 게이트 통과 ──
exit 0
