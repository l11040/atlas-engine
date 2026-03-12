#!/usr/bin/env bash
# 목적: Task의 expected_files를 순회하며 SHA-256 + size를 계산하여 artifacts.json 갱신
# 사용법: RUN_DIR=${RUN_DIR} bash record-artifacts.sh TASK_ID
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

META_FILE="$(task_meta "$TASK_ID")"
ARTIFACTS_FILE="$(task_artifacts "$TASK_ID")"

if [ ! -f "$META_FILE" ]; then
  log_error "task.json not found: $META_FILE"
  exit 1
fi

# 목적: expected_files 목록 추출
EXPECTED_FILES=$(jq -r '.expected_files[]?' "$META_FILE" 2>/dev/null)

if [ -z "$EXPECTED_FILES" ]; then
  log_warn "expected_files가 비어있습니다: $TASK_ID"
fi

FILES_JSON="[]"

while IFS= read -r rel_path; do
  [ -z "$rel_path" ] && continue
  abs_path="${PROJECT_ROOT}/${rel_path}"

  if [ ! -f "$abs_path" ]; then
    log_warn "파일이 존재하지 않습니다 (스킵): $rel_path"
    continue
  fi

  # 목적: SHA-256 해시 계산 (macOS: shasum -a 256, Linux: sha256sum)
  if command -v shasum &>/dev/null; then
    SHA256=$(shasum -a 256 "$abs_path" | cut -d' ' -f1)
  else
    SHA256=$(sha256sum "$abs_path" | cut -d' ' -f1)
  fi

  # 목적: 파일 크기 계산 (macOS: stat -f, Linux: stat -c)
  if [[ "$(uname)" == "Darwin" ]]; then
    SIZE=$(stat -f%z "$abs_path")
  else
    SIZE=$(stat -c%s "$abs_path")
  fi

  # 목적: git에서 파일 상태 확인 (new file = created, modified = modified)
  if git -C "$PROJECT_ROOT" ls-files --error-unmatch "$rel_path" &>/dev/null 2>&1; then
    # 이유: 이미 tracked인 파일은 modified, 아니면 created
    if git -C "$PROJECT_ROOT" diff --name-only HEAD -- "$rel_path" | grep -q .; then
      ACTION="modified"
    else
      ACTION="created"
    fi
  else
    ACTION="created"
  fi

  FILES_JSON=$(echo "$FILES_JSON" | jq \
    --arg path "$rel_path" \
    --arg action "$ACTION" \
    --arg sha256 "$SHA256" \
    --argjson size "$SIZE" \
    '. + [{"path": $path, "action": $action, "sha256": $sha256, "size_bytes": $size}]')

done <<< "$EXPECTED_FILES"

# 목적: artifacts.json 갱신
jq -n \
  --arg task_id "$TASK_ID" \
  --argjson files "$FILES_JSON" \
  '{"task_id": $task_id, "files": $files}' \
  > "$ARTIFACTS_FILE"

FILE_COUNT=$(echo "$FILES_JSON" | jq 'length')
log_info "record-artifacts: $TASK_ID — ${FILE_COUNT}개 파일 기록 완료"
