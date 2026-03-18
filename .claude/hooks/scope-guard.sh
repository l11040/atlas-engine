#!/usr/bin/env bash
# 목적: Write/Edit 전에 forbidden path를 물리적으로 차단
# 트리거: PreToolUse (Write|Edit)
# 입력: stdin으로 JSON (tool_input.file_path)
# 출력: permissionDecision deny 또는 exit 0 (허용)

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# ── 1. 하드코딩 forbidden (ATLAS_ACTIVE 여부와 무관하게 항상 적용) ──
ALWAYS_FORBIDDEN=(
  ".env"
  ".env.local"
  ".env.production"
  ".env.example"
  "credentials"
  "secrets"
  ".github/workflows"
  ".claude/hooks/"
  ".claude/settings"
)

for pattern in "${ALWAYS_FORBIDDEN[@]}"; do
  if [[ "$FILE_PATH" == *"$pattern"* ]]; then
    jq -n --arg path "$FILE_PATH" --arg pattern "$pattern" '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: ("SCOPE GUARD: forbidden path — " + $path + " matches " + $pattern)
      }
    }'
    exit 0
  fi
done

# atlas 실행 중이 아니면 나머지 검사는 패스
if [ -z "${ATLAS_ACTIVE:-}" ]; then
  exit 0
fi

# ── 2. conventions.json의 forbidden paths (동적, atlas 실행 중에만) ──
CONVENTIONS="${ATLAS_CONVENTIONS:-}"
if [ -n "$CONVENTIONS" ] && [ -f "$CONVENTIONS" ]; then
  FORBIDDEN=$(jq -r '.forbidden[]? // empty' "$CONVENTIONS" 2>/dev/null)
  while IFS= read -r rule; do
    [ -z "$rule" ] && continue
    if [[ "$FILE_PATH" == *"$rule"* ]]; then
      jq -n --arg path "$FILE_PATH" --arg rule "$rule" '{
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: ("SCOPE GUARD: conventions.json forbidden — " + $path + " matches " + $rule)
        }
      }'
      exit 0
    fi
  done <<< "$FORBIDDEN"
fi

# ── 3. Task scope 검증 (editable_paths 밖이면 경고) ──
SCOPE_FILES="${ATLAS_SCOPE_FILES:-}"
if [ -n "$SCOPE_FILES" ]; then
  MATCH=false
  for allowed in $SCOPE_FILES; do
    if [[ "$FILE_PATH" == *"$allowed"* ]]; then
      MATCH=true
      break
    fi
  done
  if [ "$MATCH" = false ]; then
    # deny가 아닌 ask — scope 밖이지만 사용자에게 확인
    jq -n --arg path "$FILE_PATH" '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: ("SCOPE WARNING: " + $path + " is outside task scope. Proceed?")
      }
    }'
    exit 0
  fi
fi

exit 0
