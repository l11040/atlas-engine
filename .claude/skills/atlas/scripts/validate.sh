#!/usr/bin/env bash
# 목적: 코드 생성 후 사후 검증 — scope / build / lint / domain-lint 4개 게이트
# 사용법: validate.sh [옵션]
#   --scope "file1 file2 ..."   허용된 파일 목록 (공백 구분)
#   --build "command"           빌드 커맨드 (미지정 시 conventions.json에서 읽음)
#   --lint "command"            린트 커맨드 (미지정 시 conventions.json에서 읽음)
#   --conventions "path"        conventions.json 경로
#   --project-root "path"       프로젝트 루트
#   --domain-lint               도메인 린트 활성화 (conventions.json의 domain_lint 배열 실행)
#   --source-dir "path"         도메인 린트 탐색 대상 디렉토리 (기본: project-root)
#
# Exit codes:
#   0: 전체 통과
#   1: scope 위반 (위반 파일은 자동 되돌림)
#   2: 빌드 실패
#   3: lint 실패
#   4: domain-lint 위반
set -euo pipefail

SCOPE_FILES=""
BUILD_CMD=""
LINT_CMD=""
CONVENTIONS=""
PROJECT_ROOT="."
TASK_ID=""
RUN_DIR=""
DOMAIN_LINT=false
SOURCE_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope)       SCOPE_FILES="$2"; shift 2 ;;
    --build)       BUILD_CMD="$2"; shift 2 ;;
    --lint)        LINT_CMD="$2"; shift 2 ;;
    --conventions) CONVENTIONS="$2"; shift 2 ;;
    --project-root) PROJECT_ROOT="$2"; shift 2 ;;
    --task-id)     TASK_ID="$2"; shift 2 ;;
    --run-dir)     RUN_DIR="$2"; shift 2 ;;
    --domain-lint) DOMAIN_LINT=true; shift ;;
    --source-dir)  SOURCE_DIR="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

cd "$PROJECT_ROOT"

# 목적: 검증 실패 시 에러 증거를 자동 기록한다
_record_validate_error() {
  local exit_code="$1" gate_failed="$2" stderr_msg="$3"
  if [ -n "$TASK_ID" ] && [ -n "$RUN_DIR" ]; then
    mkdir -p "${RUN_DIR}/evidence/execute/task-${TASK_ID}"
    local error_file="${RUN_DIR}/evidence/execute/task-${TASK_ID}/validate.error.json"
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

# ── Gate 4: Domain Lint 검증 ──
# 목적: conventions.json의 domain_lint 배열에서 선언적 룰을 읽어 기계적으로 검증한다
# 주의: 하드코딩된 스택 종속 룰 없음 — 모든 룰은 learn 단계에서 프로젝트별로 생성된다
# 지원 룰 타입:
#   require_guard  — trigger+condition 파일에 guard 패턴이 없으면 위반
#   forbidden_name — trigger에서 name_attr 값을 추출하여 forbidden 목록과 대조
#   method_guard   — 특정 메서드 내부에 guard_pattern이 없으면 위반
if [ "$DOMAIN_LINT" = true ]; then
  SCAN_DIR="${SOURCE_DIR:-$PROJECT_ROOT}"
  DOMAIN_VIOLATIONS=""

  echo "[validate] Domain Lint: scanning $SCAN_DIR"

  # conventions.json에서 domain_lint 배열 읽기
  CONV_FILE="${CONVENTIONS:-${PROJECT_ROOT}/.automation/conventions.json}"
  if [ ! -f "$CONV_FILE" ]; then
    echo "[validate] Domain Lint: conventions.json 없음 — 스킵" >&2
  else
    RULE_COUNT=$(jq '.domain_lint | length // 0' "$CONV_FILE" 2>/dev/null || echo 0)
    echo "[validate] Domain Lint: ${RULE_COUNT} rules loaded"

    for i in $(seq 0 $((RULE_COUNT - 1))); do
      RULE_JSON=$(jq -c ".domain_lint[$i]" "$CONV_FILE")
      RULE_ID=$(echo "$RULE_JSON" | jq -r '.id')
      RULE_TYPE=$(echo "$RULE_JSON" | jq -r '.type')
      FILE_GLOB=$(echo "$RULE_JSON" | jq -r '.file_glob')
      TRIGGER=$(echo "$RULE_JSON" | jq -r '.trigger')
      MESSAGE=$(echo "$RULE_JSON" | jq -r '.message')
      EXCLUDE=$(echo "$RULE_JSON" | jq -r '.exclude // empty')

      case "$RULE_TYPE" in

        # ── require_guard ──
        # 목적: trigger 파일 중 condition이 있으면 guard가 반드시 있어야 한다
        # 예시: @Entity + BigDecimal → @Version 필수 (Java/JPA)
        # 예시: class.*Model + DecimalField → version = IntegerField 필수 (Django)
        # 예시: type.*struct + sync.Mutex → mu.Lock() 필수 (Go)
        require_guard)
          CONDITION=$(echo "$RULE_JSON" | jq -r '.condition // empty')
          GUARD=$(echo "$RULE_JSON" | jq -r '.guard')

          while IFS= read -r file; do
            [ -z "$file" ] && continue
            # 주의: 빌드 산출물/의존성 디렉토리 제외
            [[ "$file" == */build/* || "$file" == */dist/* || "$file" == */node_modules/* || "$file" == */__pycache__/* || "$file" == */target/* ]] && continue
            if [ -n "$EXCLUDE" ] && grep -qE "$EXCLUDE" "$file" 2>/dev/null; then
              continue
            fi
            if [ -n "$CONDITION" ]; then
              if grep -q "$CONDITION" "$file" && ! grep -q "$GUARD" "$file"; then
                local_path="${file#"$SCAN_DIR"/}"
                DOMAIN_VIOLATIONS+="${RULE_ID}: ${MESSAGE} — ${local_path}\n"
              fi
            else
              if ! grep -q "$GUARD" "$file"; then
                local_path="${file#"$SCAN_DIR"/}"
                DOMAIN_VIOLATIONS+="${RULE_ID}: ${MESSAGE} — ${local_path}\n"
              fi
            fi
          done < <(grep -rl "$TRIGGER" --include="$FILE_GLOB" "$SCAN_DIR" 2>/dev/null || true)
          ;;

        # ── forbidden_name ──
        # 목적: trigger 이후 name_attr="VALUE"를 추출하여 forbidden 목록과 대조한다
        # 예시: @Table(name="grant") → MySQL 예약어 위반 (Java/JPA)
        # 예시: __tablename__ = "order" → PostgreSQL 예약어 위반 (SQLAlchemy)
        # 예시: tableName: "group" → 예약어 위반 (TypeORM)
        forbidden_name)
          NAME_ATTR=$(echo "$RULE_JSON" | jq -r '.name_attr')
          FORBIDDEN_LIST=$(echo "$RULE_JSON" | jq -r '.forbidden[]' 2>/dev/null || true)
          [ -z "$FORBIDDEN_LIST" ] && continue

          while IFS= read -r file; do
            [ -z "$file" ] && continue
            [[ "$file" == */build/* || "$file" == */dist/* || "$file" == */node_modules/* || "$file" == */__pycache__/* || "$file" == */target/* ]] && continue
            if [ -n "$EXCLUDE" ] && grep -qE "$EXCLUDE" "$file" 2>/dev/null; then
              continue
            fi
            # awk: trigger 직후 첫 번째 name_attr = "VALUE" 추출 — BSD/GNU 호환
            extracted=$(awk -v trigger="$TRIGGER" -v attr="$NAME_ATTR" '
              $0 ~ trigger { found=1 }
              found && $0 ~ attr "[[:space:]]*=[[:space:]]*\"" {
                line = $0
                sub(".*" attr "[[:space:]]*=[[:space:]]*\"", "", line)
                sub("\".*", "", line)
                print line; exit
              }
            ' "$file" 2>/dev/null | head -1 || true)
            [ -z "$extracted" ] && continue
            lower_name=$(echo "$extracted" | tr '[:upper:]' '[:lower:]')
            while IFS= read -r forbidden_word; do
              [ -z "$forbidden_word" ] && continue
              if [ "$lower_name" = "$forbidden_word" ]; then
                local_path="${file#"$SCAN_DIR"/}"
                DOMAIN_VIOLATIONS+="${RULE_ID}: ${NAME_ATTR}=\"${extracted}\" ${MESSAGE} — ${local_path}\n"
                break
              fi
            done <<< "$FORBIDDEN_LIST"
          done < <(grep -rl "$TRIGGER" --include="$FILE_GLOB" "$SCAN_DIR" 2>/dev/null || true)
          ;;

        # ── method_guard ──
        # 목적: 특정 패턴의 메서드 내부에 guard(if/throw 등)가 없으면 위반
        # 주의: brace 기반 블록 추적이므로 C-family 언어(Java, TypeScript, Go 등)에 적합
        #       Python 등 indent 기반 언어에는 require_guard를 권장한다
        # 예시: activate()/expire() 메서드에 if+throw 없음 (Java)
        # 예시: transition_to() 내부에 raise/assert 없음 (TypeScript)
        method_guard)
          PREREQUISITE=$(echo "$RULE_JSON" | jq -r '.prerequisite // empty')
          METHOD_PATTERN=$(echo "$RULE_JSON" | jq -r '.method_pattern')
          GUARD_PATTERN=$(echo "$RULE_JSON" | jq -r '.guard_pattern')
          METHOD_VISIBILITY=$(echo "$RULE_JSON" | jq -r '.method_visibility // "public"')

          while IFS= read -r file; do
            [ -z "$file" ] && continue
            [[ "$file" == */build/* || "$file" == */dist/* || "$file" == */node_modules/* || "$file" == */__pycache__/* || "$file" == */target/* ]] && continue
            if [ -n "$EXCLUDE" ] && grep -qE "$EXCLUDE" "$file" 2>/dev/null; then
              continue
            fi
            if [ -n "$PREREQUISITE" ] && ! grep -q "$PREREQUISITE" "$file" 2>/dev/null; then
              continue
            fi
            # awk: method_pattern 메서드를 찾고 brace 카운팅으로 블록 범위를 추적한다
            awk_result=$(awk -v mp="$METHOD_PATTERN" -v gp="$GUARD_PATTERN" -v vis="$METHOD_VISIBILITY" '
              $0 ~ vis && $0 ~ mp && /\(/ {
                method_name = $0
                in_method = 1
                brace_count = 0
                has_guard = 0
                next
              }
              in_method {
                line = $0
                gsub(/[^{}]/, "", line)
                brace_count += gsub(/{/, "{", line)
                brace_count -= gsub(/}/, "}", line)
              }
              in_method && $0 ~ gp {
                has_guard = 1
              }
              in_method && brace_count <= 0 {
                if (!has_guard) {
                  print method_name
                }
                in_method = 0
              }
            ' "$file" 2>/dev/null || true)

            if [ -n "$awk_result" ]; then
              local_path="${file#"$SCAN_DIR"/}"
              while IFS= read -r method_line; do
                [ -z "$method_line" ] && continue
                DOMAIN_VIOLATIONS+="${RULE_ID}: ${MESSAGE} — ${local_path}\n"
              done <<< "$awk_result"
            fi
          done < <(grep -rl "$TRIGGER" --include="$FILE_GLOB" "$SCAN_DIR" 2>/dev/null || true)
          ;;

        *)
          echo "[validate] Unknown domain_lint rule type: $RULE_TYPE (${RULE_ID})" >&2
          ;;
      esac
    done
  fi

  # 위반 보고
  if [ -n "$DOMAIN_VIOLATIONS" ]; then
    echo "DOMAIN LINT FAILED:" >&2
    echo -e "$DOMAIN_VIOLATIONS" | grep -v '^$' >&2
    _record_validate_error 4 "domain-lint" "$(echo -e "$DOMAIN_VIOLATIONS" | grep -v '^$')"
    exit 4
  fi

  echo "[validate] Domain Lint: all checks passed"
fi

# ── 증거 자동 기록 ──
# 주의: --task-id와 --run-dir이 모두 제공된 경우에만 기록한다
GATES_PASSED=()
[ -n "$SCOPE_FILES" ] && GATES_PASSED+=("scope")
[ -n "$EFFECTIVE_BUILD" ] && GATES_PASSED+=("build")
[ -n "$EFFECTIVE_LINT" ] && GATES_PASSED+=("lint")
[ "$DOMAIN_LINT" = true ] && GATES_PASSED+=("domain-lint")

if [ -n "$TASK_ID" ] && [ -n "$RUN_DIR" ]; then
  mkdir -p "${RUN_DIR}/evidence/execute/task-${TASK_ID}"
  EVIDENCE_FILE="${RUN_DIR}/evidence/execute/task-${TASK_ID}/validate.json"
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
