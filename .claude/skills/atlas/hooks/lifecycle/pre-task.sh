#!/usr/bin/env bash
# 목적: Task 실행 시작 전 준비. git HEAD 기록 + 작업 디렉토리 생성
# 사용법: RUN_DIR=${RUN_DIR} bash pre-task.sh TASK_ID
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ATLAS_ROOT="${SCRIPT_DIR}/../.."
source "${ATLAS_ROOT}/scripts/common.sh"

load_env

TASK_ID="${1:?Error: TASK_ID is required}"

if [ -z "${RUN_DIR:-}" ]; then
  log_error "RUN_DIR 환경변수가 설정되지 않았습니다."
  exit 1
fi

TASK_DIR="$(task_dir "$TASK_ID")"

# 목적: validation/, evidence/ 디렉토리 생성
mkdir -p "${TASK_DIR}/validation"
mkdir -p "${TASK_DIR}/evidence"
mkdir -p "${TASK_DIR}/state"

# 목적: git HEAD 기록 (롤백 기준점)
BASE_HEAD=$(cd "$PROJECT_ROOT" && git rev-parse HEAD 2>/dev/null || echo "unknown")
echo "$BASE_HEAD" > "${TASK_DIR}/state/base-head.txt"

# 목적: 시작 시각 기록 (duration 계산용)
now_ms > "${TASK_DIR}/state/started-ms.txt"

log_info "pre-task: $TASK_ID — HEAD=$BASE_HEAD, 디렉토리 준비 완료"
