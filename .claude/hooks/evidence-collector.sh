#!/usr/bin/env bash
# 목적: validate.sh 실행 결과를 자동으로 evidence에 기록 (fallback)
# 트리거: PostToolUse (Bash)
# 조건: validate.sh 실행인 경우에만 작동
# 주의: validate.sh 자체가 evidence를 기록하므로 이 hook은 보조적 역할만 한다

# atlas 실행 중이 아니면 패스
if [ -z "${ATLAS_ACTIVE:-}" ]; then
  exit 0
fi

RUN_DIR="${ATLAS_RUN_DIR:-}"
TASK_ID="${ATLAS_CURRENT_TASK:-}"
if [ -z "$RUN_DIR" ] || [ -z "$TASK_ID" ]; then
  exit 0
fi

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# validate.sh 실행인지 확인
if [[ "$COMMAND" != *"validate.sh"* ]]; then
  exit 0
fi

EXIT_CODE=$(echo "$INPUT" | jq -r '.result.exitCode // .result.exit_code // empty' 2>/dev/null)
STDOUT=$(echo "$INPUT" | jq -r '.result.stdout // empty' 2>/dev/null | tail -50)

# validate.sh가 증거를 기록하지 못한 경우의 fallback
EVIDENCE_DIR="${RUN_DIR}/evidence/execute/task-${TASK_ID}"
VALIDATE_FILE="${EVIDENCE_DIR}/validate.json"

if [ ! -f "$VALIDATE_FILE" ]; then
  mkdir -p "$EVIDENCE_DIR"

  STATUS="fail"
  TAXONOMY="unknown"
  GATE_FAILED="unknown"
  if [ "$EXIT_CODE" = "0" ]; then
    STATUS="pass"
    TAXONOMY="pass"
    GATE_FAILED=""
  else
    case "$EXIT_CODE" in
      1) TAXONOMY="scope_violation"; GATE_FAILED="scope" ;;
      2) TAXONOMY="compile_error"; GATE_FAILED="build" ;;
      3) TAXONOMY="lint_violation"; GATE_FAILED="lint" ;;
      4) TAXONOMY="domain_lint"; GATE_FAILED="domain-lint" ;;
    esac
  fi

  jq -n \
    --arg type "validate_result" \
    --arg status "$STATUS" \
    --arg exit_code "$EXIT_CODE" \
    --arg taxonomy "$TAXONOMY" \
    --arg gate_failed "$GATE_FAILED" \
    --arg output "$STDOUT" \
    --arg source "evidence-collector-hook-fallback" \
    --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    '{
      type: $type,
      status: $status,
      exit_code: ($exit_code | tonumber),
      taxonomy: $taxonomy,
      gate_failed: $gate_failed,
      output_tail: $output,
      source: $source,
      timestamp: $ts
    }' > "$VALIDATE_FILE"
fi

exit 0
