#!/usr/bin/env bash
# 목적: Write/Edit 대상 파일이 현재 스텝의 권한 정책에 부합하는지 검증한다.
# 사용법: ATLAS_STEP=execute PROJECT_ROOT=... RUN_DIR=... bash check-file-policy.sh <file_path> <action>
# exit 0: 허용, exit 1: 차단 (이유를 stderr에 출력)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLICY_FILE="${SCRIPT_DIR}/file-policy.json"

FILE_PATH="${1:?Error: file_path is required}"
ACTION="${2:-write}"  # write | edit | read
ATLAS_STEP="${ATLAS_STEP:?Error: ATLAS_STEP is required (learn|analyze|plan|execute)}"
PROJECT_ROOT="${PROJECT_ROOT:?Error: PROJECT_ROOT is required}"

# ── 정책 파일 확인 ──
if [ ! -f "$POLICY_FILE" ]; then
  echo "BLOCKED: file-policy.json not found: $POLICY_FILE" >&2
  exit 1
fi

# ── 절대 경로로 정규화 ──
normalize_path() {
  local p="$1"
  if [[ "$p" != /* ]]; then
    p="${PROJECT_ROOT}/${p}"
  fi
  echo "$p"
}

FILE_ABS="$(normalize_path "$FILE_PATH")"

# ── 1단계: no_access 체크 ──
NO_ACCESS_PATTERNS=$(jq -r '.global.no_access[]' "$POLICY_FILE" 2>/dev/null)
while IFS= read -r pattern; do
  [ -z "$pattern" ] && continue
  # 주의: 파일명만 비교 (경로 무관하게 .env 차단)
  local_name="$(basename "$FILE_ABS")"
  case "$local_name" in
    $pattern)
      echo "BLOCKED [no-access]: '$FILE_PATH' matches no_access pattern '$pattern'" >&2
      exit 1
      ;;
  esac
done <<< "$NO_ACCESS_PATTERNS"

# ── 2단계: readonly 체크 (write/edit 시에만) ──
if [[ "$ACTION" == "write" || "$ACTION" == "edit" ]]; then
  READONLY_PATTERNS=$(jq -r '.global.readonly[]' "$POLICY_FILE" 2>/dev/null)

  # 주의: PROJECT_ROOT 기준 상대 경로로 변환하여 glob 매칭
  REL_PATH="${FILE_ABS#${PROJECT_ROOT}/}"

  while IFS= read -r pattern; do
    [ -z "$pattern" ] && continue
    # 목적: bash glob 매칭 (extglob 패턴)
    # ** 패턴을 단순 prefix 매칭으로 변환
    prefix="${pattern%%\*\**}"
    if [[ -n "$prefix" && "$REL_PATH" == ${prefix}* ]]; then
      echo "BLOCKED [readonly]: '$FILE_PATH' matches readonly pattern '$pattern'" >&2
      echo "  step=$ATLAS_STEP, action=$ACTION" >&2
      echo "  이 파일은 atlas 스킬의 readonly 정책에 의해 수정이 금지됩니다." >&2
      exit 1
    fi
  done <<< "$READONLY_PATTERNS"

  # ── 3단계: 스텝별 writable 체크 ──
  STEP_WRITABLE=$(jq -r --arg step "$ATLAS_STEP" '.steps[$step].writable[]? // empty' "$POLICY_FILE" 2>/dev/null)

  if [ -z "$STEP_WRITABLE" ]; then
    echo "BLOCKED [no-writable-policy]: step '$ATLAS_STEP' has no writable paths defined" >&2
    exit 1
  fi

  # 목적: 변수 치환 (${RUN_DIR}, ${PROJECT_ROOT})
  expand_pattern() {
    local p="$1"
    p="${p//\$\{RUN_DIR\}/${RUN_DIR:-__UNSET__}}"
    p="${p//\$\{PROJECT_ROOT\}/${PROJECT_ROOT}}"
    echo "$p"
  }

  ALLOWED=false
  while IFS= read -r pattern; do
    [ -z "$pattern" ] && continue
    expanded="$(expand_pattern "$pattern")"

    if [[ "$expanded" == *"__UNSET__"* ]]; then
      echo "WARN: RUN_DIR not set, skipping pattern '$pattern'" >&2
      continue
    fi

    # 목적: ** 패턴을 prefix 매칭으로 처리
    prefix="${expanded%%\*\**}"
    if [[ -n "$prefix" ]]; then
      if [[ "$FILE_ABS" == ${prefix}* ]]; then
        ALLOWED=true
        break
      fi
    fi

    # 목적: 정확한 경로 매칭
    expanded_abs="$(normalize_path "$expanded")"
    if [[ "$FILE_ABS" == "$expanded_abs" ]]; then
      ALLOWED=true
      break
    fi
  done <<< "$STEP_WRITABLE"

  # ── 4단계: writable_exclude 체크 ──
  if [ "$ALLOWED" = true ]; then
    EXCLUDES=$(jq -r --arg step "$ATLAS_STEP" '.steps[$step].writable_exclude[]? // empty' "$POLICY_FILE" 2>/dev/null)
    while IFS= read -r pattern; do
      [ -z "$pattern" ] && continue
      expanded="$(expand_pattern "$pattern")"
      prefix="${expanded%%\*\**}"
      if [[ -n "$prefix" && "$REL_PATH" == ${prefix}* ]]; then
        ALLOWED=false
        echo "BLOCKED [writable-exclude]: '$FILE_PATH' matches exclude pattern '$pattern'" >&2
        exit 1
      fi
    done <<< "$EXCLUDES"
  fi

  if [ "$ALLOWED" = false ]; then
    echo "BLOCKED [not-writable]: '$FILE_PATH' is not in step '$ATLAS_STEP' writable paths" >&2
    echo "  허용된 경로:" >&2
    while IFS= read -r pattern; do
      [ -z "$pattern" ] && continue
      echo "    - $(expand_pattern "$pattern")" >&2
    done <<< "$STEP_WRITABLE"
    exit 1
  fi
fi

# ── 통과 ──
echo "ALLOWED: $ACTION '$FILE_PATH' (step=$ATLAS_STEP)"
exit 0
