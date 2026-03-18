#!/usr/bin/env bash
# 목적: Write/Edit 후 자동으로 컴파일/타입 체크, 에러를 LLM에 피드백
# 트리거: PostToolUse (Write|Edit)
# 출력: additionalContext로 에러 주입 또는 exit 0
# 주의: block하지 않는다 — 피드백만 제공

# atlas 실행 중이 아니면 패스
if [ -z "${ATLAS_ACTIVE:-}" ]; then
  exit 0
fi

PROJECT_ROOT="${ATLAS_PROJECT_ROOT:-}"
if [ -z "$PROJECT_ROOT" ]; then
  exit 0
fi

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# conventions.json에서 빌드 커맨드 읽기
CONVENTIONS="${ATLAS_CONVENTIONS:-}"
BUILD_CMD=""
if [ -n "$CONVENTIONS" ] && [ -f "$CONVENTIONS" ]; then
  BUILD_CMD=$(jq -r '.commands.build // empty' "$CONVENTIONS" 2>/dev/null)
fi

if [ -z "$BUILD_CMD" ]; then
  exit 0
fi

# 빌드 실행 (타임아웃 30초, 실패해도 block하지 않음)
RESULT=$(cd "$PROJECT_ROOT" && timeout 30 bash -c "$BUILD_CMD" 2>&1 | tail -30) || true
EXIT=$?

# timeout 자체의 exit code (124)도 실패로 처리
if [ $EXIT -ne 0 ]; then
  if [ $EXIT -eq 124 ]; then
    RESULT="Build timed out (30s)"
  fi
  jq -n --arg msg "$RESULT" --arg file "$FILE_PATH" '{
    additionalContext: ("COMPILE ERROR after editing " + $file + ":\n```\n" + $msg + "\n```\nFix this error before proceeding to the next step.")
  }'
fi

exit 0
