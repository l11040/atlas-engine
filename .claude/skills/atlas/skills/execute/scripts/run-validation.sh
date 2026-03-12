#!/usr/bin/env bash
# 목적: conventions.json의 stack.build로 빌드/타입체크 실행, 결과를 validation-result.json으로 저장
# 사용법: RUN_DIR=${RUN_DIR} bash run-validation.sh TASK_ID
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ATLAS_ROOT="${SCRIPT_DIR}/../../.."
source "${ATLAS_ROOT}/scripts/common.sh"

load_env

TASK_ID="${1:?Error: TASK_ID is required}"

if [ -z "${RUN_DIR:-}" ]; then
  log_error "RUN_DIR 환경변수가 설정되지 않았습니다."
  exit 1
fi

TASK_DIR="$(task_dir "$TASK_ID")"
VALIDATION_DIR="${TASK_DIR}/validation"
RESULT_FILE="${VALIDATION_DIR}/validation-result.json"
CONVENTIONS_FILE="${AUTOMATION_PATH}/conventions.json"

mkdir -p "$VALIDATION_DIR"

# 목적: conventions.json의 commands.build에서 프로젝트별 빌드 커맨드를 읽는다
BUILD_CMD=""
if [ -f "$CONVENTIONS_FILE" ]; then
  BUILD_CMD=$(jq -r '.commands.build // ""' "$CONVENTIONS_FILE" 2>/dev/null)

  if [ -z "$BUILD_CMD" ]; then
    log_warn "conventions.json에 commands.build가 없습니다 — 빌드 스킵"
  fi
fi

PASSED=true
BUILD_OUTPUT=""
BUILD_EXIT=0

if [ -n "$BUILD_CMD" ]; then
  log_info "run-validation: $TASK_ID — 빌드 실행: $BUILD_CMD"

  # 목적: 빌드 실행, 실패해도 스크립트는 계속 진행
  if BUILD_OUTPUT=$(cd "$PROJECT_ROOT" && eval "$BUILD_CMD" 2>&1); then
    BUILD_EXIT=0
    log_info "run-validation: $TASK_ID — 빌드 성공"
  else
    BUILD_EXIT=$?
    PASSED=false
    log_error "run-validation: $TASK_ID — 빌드 실패 (exit=$BUILD_EXIT)"
  fi
else
  log_info "run-validation: $TASK_ID — 빌드 커맨드 없음, 파일 존재만 확인"

  # 목적: 빌드 커맨드가 없으면 expected_files 존재 여부만 확인
  META_FILE="$(task_meta "$TASK_ID")"
  if [ -f "$META_FILE" ]; then
    EXPECTED_FILES=$(jq -r '.expected_files[]?' "$META_FILE" 2>/dev/null)
    while IFS= read -r rel_path; do
      [ -z "$rel_path" ] && continue
      if [ ! -f "${PROJECT_ROOT}/${rel_path}" ]; then
        PASSED=false
        BUILD_OUTPUT="Missing file: ${rel_path}"
        log_error "run-validation: $TASK_ID — 파일 누락: $rel_path"
        break
      fi
    done <<< "$EXPECTED_FILES"
  fi
fi

# 주의: BUILD_OUTPUT이 너무 크면 truncate (JSON 안전성)
MAX_OUTPUT=4000
if [ ${#BUILD_OUTPUT} -gt $MAX_OUTPUT ]; then
  BUILD_OUTPUT="${BUILD_OUTPUT:0:$MAX_OUTPUT}... [truncated]"
fi

# 목적: validation-result.json 생성
jq -n \
  --arg task_id "$TASK_ID" \
  --argjson passed "$PASSED" \
  --arg build_cmd "${BUILD_CMD:-none}" \
  --argjson exit_code "$BUILD_EXIT" \
  --arg output "$BUILD_OUTPUT" \
  --arg validated_at "$(now_iso)" \
  '{task_id: $task_id, passed: $passed, build_command: $build_cmd, exit_code: $exit_code, output: $output, validated_at: $validated_at}' \
  > "$RESULT_FILE"

log_info "run-validation: $TASK_ID — 결과: passed=$PASSED → $RESULT_FILE"
