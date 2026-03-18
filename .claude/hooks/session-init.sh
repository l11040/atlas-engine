#!/usr/bin/env bash
# 목적: 세션 시작 시 atlas 환경변수를 CLAUDE_ENV_FILE에 등록
# 트리거: SessionStart (startup)
# 주의: atlas 실행 전에는 ATLAS_ACTIVE=""이므로 다른 hooks는 작동하지 않는다

if [ -z "${CLAUDE_ENV_FILE:-}" ]; then
  exit 0
fi

cat >> "$CLAUDE_ENV_FILE" <<'EOF'
ATLAS_ACTIVE=
ATLAS_PROJECT_ROOT=
ATLAS_CONVENTIONS=
ATLAS_RUN_DIR=
ATLAS_CURRENT_TASK=
ATLAS_SCOPE_FILES=
ATLAS_RETRY_COUNT=0
EOF

exit 0
