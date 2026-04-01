#!/bin/bash
# session-init.sh — SessionStart Hook
# 컴팩트 후 재개 시 phase-context.json에서 환경변수를 복원한다.
# 최초 시작 시 기본값만 설정한다.

set -euo pipefail

# run_dir 탐색: 환경변수 또는 가장 최근 run_dir
RUN_DIR="${ATLAS_RUN_DIR:-}"

if [ -z "$RUN_DIR" ]; then
  # 가장 최근 run_dir 자동 탐색
  AUTOMATION_DIR=".automation/runs"
  if [ -d "$AUTOMATION_DIR" ]; then
    RUN_DIR=$(ls -dt "${AUTOMATION_DIR}"/*/ 2>/dev/null | head -1)
  fi
fi

PHASE_CTX="${RUN_DIR:+${RUN_DIR}/phase-context.json}"

if [ -n "$PHASE_CTX" ] && [ -f "$PHASE_CTX" ]; then
  # 컴팩트 후 재개 — 환경변수 복원
  ATLAS_PHASE=$(jq -r '.pipeline.current_phase' "$PHASE_CTX")
  ATLAS_TICKET=$(jq -r '.pipeline.ticket_key' "$PHASE_CTX")
  ATLAS_CURRENT_TASK=$(jq -r '.tasks.current // empty' "$PHASE_CTX")
  ATLAS_RETRY=$(jq -r '.ralp_state.current_retry' "$PHASE_CTX")
  ATLAS_RUN_DIR="$RUN_DIR"

  # resume-prompt.md 생성
  cat > "${RUN_DIR}/resume-prompt.md" << EOF
# Atlas 파이프라인 재개

## 현재 상태
- 단계: ${ATLAS_PHASE}
- 티켓: ${ATLAS_TICKET}
- 현재 태스크: ${ATLAS_CURRENT_TASK:-없음}
- RALP retry: ${ATLAS_RETRY}
- Run dir: ${ATLAS_RUN_DIR}

## 필수 파일 로드
- source: $(jq -r '.artifacts.source_json' "$PHASE_CTX")
- conventions: $(jq -r '.artifacts.conventions // "미생성"' "$PHASE_CTX")
- 현재 태스크: $(jq -r '.artifacts.current_task_file // "미생성"' "$PHASE_CTX")

## 다음 액션
${ATLAS_PHASE} 단계를 이어서 수행하세요.
EOF

  echo "Atlas 재개: phase=${ATLAS_PHASE}, ticket=${ATLAS_TICKET}, task=${ATLAS_CURRENT_TASK:-없음}"
else
  # 최초 시작
  echo "Atlas 초기화: phase-context.json 미발견 — 최초 시작 모드"
fi
