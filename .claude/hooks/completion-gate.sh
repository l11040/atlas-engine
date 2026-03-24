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

# ── Gate 4: convention-check 증거 확인 ──
CONVENTION_FILE="${EVIDENCE_DIR}/convention-check.json"

if [ ! -f "$CONVENTION_FILE" ]; then
  jq -n --arg task "$TASK_ID" '{
    decision: "block",
    reason: "convention-check not executed",
    systemMessage: ("GATE BLOCKED: Task " + $task + " — convention-check가 아직 실행되지 않았습니다. convention-check 스킬의 체크리스트를 실행하고 증거를 기록하세요.")
  }'
  exit 0
fi

# convention-check 결과가 FAIL이면 차단
CONV_FAIL_COUNT=$(jq -r '.summary.fail // 0' "$CONVENTION_FILE" 2>/dev/null)
if [ "$CONV_FAIL_COUNT" -gt 0 ]; then
  CONV_FAILURES=$(jq -r '.checks[] | select(.status == "FAIL") | "  [\(.id)] \(.rule): \(.fix_hint // "수동 수정 필요")"' "$CONVENTION_FILE" 2>/dev/null)
  jq -n --arg task "$TASK_ID" --arg fails "$CONV_FAILURES" --arg count "$CONV_FAIL_COUNT" '{
    decision: "block",
    reason: ("convention-check failed: " + $count + " violations"),
    systemMessage: ("GATE BLOCKED [convention]: Task " + $task + " — " + $count + "건의 컨벤션 위반이 있습니다:\n" + $fails + "\n\n위반 항목을 수정하고 convention-check를 다시 실행하세요. (기존 convention-check.json 삭제 후 재실행)")
  }'
  exit 0
fi

# ── Gate 5: evidence 포맷 검증 ──
ATLAS_SKILL_DIR="${ATLAS_SKILL_DIR:-}"
VALIDATE_EVIDENCE_SH=""

# 주의: ATLAS_SKILL_DIR이 설정되어 있으면 해당 경로, 아니면 프로젝트 내부에서 탐색
if [ -n "$ATLAS_SKILL_DIR" ] && [ -f "${ATLAS_SKILL_DIR}/scripts/validate-evidence.sh" ]; then
  VALIDATE_EVIDENCE_SH="${ATLAS_SKILL_DIR}/scripts/validate-evidence.sh"
elif [ -f "${CLAUDE_PROJECT_DIR:-.}/.claude/skills/atlas/scripts/validate-evidence.sh" ]; then
  VALIDATE_EVIDENCE_SH="${CLAUDE_PROJECT_DIR:-.}/.claude/skills/atlas/scripts/validate-evidence.sh"
fi

if [ -n "$VALIDATE_EVIDENCE_SH" ]; then
  EVIDENCE_RESULT=$(bash "$VALIDATE_EVIDENCE_SH" --run-dir "$RUN_DIR" --task-id "$TASK_ID" --fix-residual 2>&1) || {
    # 실패 항목만 추출
    FAILURES=$(echo "$EVIDENCE_RESULT" | grep "✗" | head -10)
    jq -n --arg task "$TASK_ID" --arg fails "$FAILURES" '{
      decision: "block",
      reason: "evidence format validation failed",
      systemMessage: ("GATE BLOCKED [evidence-format]: Task " + $task + " — 증거 파일 포맷이 스키마와 일치하지 않습니다:\n" + $fails + "\n\n반드시 common.sh 헬퍼 함수(record_generate_evidence, record_redteam_evidence, record_redteam_summary)와 record-convention-evidence.sh를 사용하여 증거를 기록하세요. cat > 또는 jq -n > 으로 직접 작성하지 마세요.")
    }'
    exit 0
  }
fi

# ── 모든 게이트 통과 ──
exit 0
