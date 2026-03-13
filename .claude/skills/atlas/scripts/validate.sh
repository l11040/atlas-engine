#!/usr/bin/env bash
# 목적: 코드 생성 후 사후 검증 — scope / build / lint 3개 게이트
# 사용법: validate.sh [옵션]
#   --scope "file1 file2 ..."   허용된 파일 목록 (공백 구분)
#   --build "command"           빌드 커맨드 (미지정 시 conventions.json에서 읽음)
#   --lint "command"            린트 커맨드 (미지정 시 conventions.json에서 읽음)
#   --conventions "path"        conventions.json 경로
#   --project-root "path"       프로젝트 루트
#
# Exit codes:
#   0: 전체 통과
#   1: scope 위반 (위반 파일은 자동 되돌림)
#   2: 빌드 실패
#   3: lint 실패
set -euo pipefail

SCOPE_FILES=""
BUILD_CMD=""
LINT_CMD=""
CONVENTIONS=""
PROJECT_ROOT="."
TASK_ID=""
RUN_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope)       SCOPE_FILES="$2"; shift 2 ;;
    --build)       BUILD_CMD="$2"; shift 2 ;;
    --lint)        LINT_CMD="$2"; shift 2 ;;
    --conventions) CONVENTIONS="$2"; shift 2 ;;
    --project-root) PROJECT_ROOT="$2"; shift 2 ;;
    --task-id)     TASK_ID="$2"; shift 2 ;;
    --run-dir)     RUN_DIR="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

cd "$PROJECT_ROOT"

# 목적: 검증 실패 시 에러 증거를 자동 기록한다
_record_validate_error() {
  local exit_code="$1" gate_failed="$2" stderr_msg="$3"
  if [ -n "$TASK_ID" ] && [ -n "$RUN_DIR" ]; then
    local error_file="${RUN_DIR}/evidence/execute/task-${TASK_ID}-validate.error.json"
    jq -n \
      --arg type "script_error" \
      --arg script "validate.sh" \
      --arg task_id "$TASK_ID" \
      --argjson exit_code "$exit_code" \
      --arg gate_failed "$gate_failed" \
      --arg stderr "$stderr_msg" \
      --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
      '{
        type: $type,
        script: $script,
        task_id: $task_id,
        exit_code: $exit_code,
        gate_failed: $gate_failed,
        stderr: $stderr,
        timestamp: $ts
      }' > "$error_file"
  fi
}

# 목적: conventions.json에서 커맨드를 읽는 헬퍼
read_convention_cmd() {
  local key="$1"
  if [ -n "$CONVENTIONS" ] && [ -f "$CONVENTIONS" ]; then
    jq -r ".commands.${key} // empty" "$CONVENTIONS" 2>/dev/null || true
  fi
}

# ── Gate 1: Scope 검증 ──
if [ -n "$SCOPE_FILES" ]; then
  # 주의: staged + unstaged + untracked 모두 포함
  CHANGED=$(git diff --name-only HEAD 2>/dev/null || true)
  UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null || true)
  ALL_CHANGED=$(echo -e "${CHANGED}\n${UNTRACKED}" | sort -u | grep -v '^$' || true)

  VIOLATIONS=""
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    # .automation/ 하위는 항상 허용
    [[ "$file" == .automation/* ]] && continue
    # scope 목록에 포함되는지 확인
    if ! echo "$SCOPE_FILES" | tr ' ' '\n' | grep -qxF "$file"; then
      VIOLATIONS="${VIOLATIONS}${file}\n"
    fi
  done <<< "$ALL_CHANGED"

  if [ -n "$VIOLATIONS" ]; then
    echo "SCOPE VIOLATION — 허용되지 않은 파일 변경:" >&2
    echo -e "$VIOLATIONS" | grep -v '^$' >&2
    # 위반 파일 되돌림
    echo -e "$VIOLATIONS" | grep -v '^$' | while IFS= read -r vf; do
      if git ls-files --error-unmatch "$vf" &>/dev/null; then
        git checkout -- "$vf" 2>/dev/null || true
      else
        rm -f "$vf" 2>/dev/null || true
      fi
    done
    _record_validate_error 1 "scope" "$(echo -e "$VIOLATIONS" | grep -v '^$')"
    exit 1
  fi
fi

# ── Gate 2: Build 검증 ──
EFFECTIVE_BUILD="${BUILD_CMD:-$(read_convention_cmd build)}"
if [ -n "$EFFECTIVE_BUILD" ]; then
  echo "[validate] Build: $EFFECTIVE_BUILD"
  BUILD_OUTPUT=$(eval "$EFFECTIVE_BUILD" 2>&1) || {
    echo "BUILD FAILED" >&2
    echo "$BUILD_OUTPUT" >&2
    _record_validate_error 2 "build" "$BUILD_OUTPUT"
    exit 2
  }
  echo "$BUILD_OUTPUT"
fi

# ── Gate 3: Lint 검증 ──
EFFECTIVE_LINT="${LINT_CMD:-$(read_convention_cmd lint)}"
if [ -n "$EFFECTIVE_LINT" ]; then
  echo "[validate] Lint: $EFFECTIVE_LINT"
  LINT_OUTPUT=$(eval "$EFFECTIVE_LINT" 2>&1) || {
    echo "LINT FAILED" >&2
    echo "$LINT_OUTPUT" >&2
    _record_validate_error 3 "lint" "$LINT_OUTPUT"
    exit 3
  }
  echo "$LINT_OUTPUT"
fi

# ── 증거 자동 기록 ──
# 주의: --task-id와 --run-dir이 모두 제공된 경우에만 기록한다
GATES_PASSED=()
[ -n "$SCOPE_FILES" ] && GATES_PASSED+=("scope")
[ -n "$EFFECTIVE_BUILD" ] && GATES_PASSED+=("build")
[ -n "$EFFECTIVE_LINT" ] && GATES_PASSED+=("lint")

if [ -n "$TASK_ID" ] && [ -n "$RUN_DIR" ]; then
  EVIDENCE_FILE="${RUN_DIR}/evidence/execute/task-${TASK_ID}-validate.json"
  # 주의: 빈 배열일 때 unbound variable 방지
  if [ ${#GATES_PASSED[@]} -eq 0 ]; then
    GATES_JSON='[]'
  else
    GATES_JSON=$(printf '%s\n' "${GATES_PASSED[@]}" | jq -R . | jq -s .)
  fi
  jq -n \
    --arg type "script" \
    --arg script "validate.sh" \
    --arg task_id "$TASK_ID" \
    --argjson exit_code 0 \
    --argjson gates_passed "$GATES_JSON" \
    --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    '{
      type: $type,
      script: $script,
      task_id: $task_id,
      exit_code: $exit_code,
      gates_passed: $gates_passed,
      timestamp: $ts
    }' > "$EVIDENCE_FILE"
fi

echo "[validate] All gates passed"
exit 0
