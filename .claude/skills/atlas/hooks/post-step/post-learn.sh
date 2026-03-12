#!/usr/bin/env bash
# 목적: /learn 완료 후 conventions.json 스키마 검증 + 증거 파일 생성
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ATLAS_ROOT="${SCRIPT_DIR}/../.."
source "${ATLAS_ROOT}/scripts/common.sh"

load_env

EVIDENCE_DIR="${AUTOMATION_PATH}/evidence"
EVIDENCE_FILE="${EVIDENCE_DIR}/learn.validated.json"
CONVENTIONS_FILE="${AUTOMATION_PATH}/conventions.json"
START_TIME=$(now_ms)

mkdir -p "$EVIDENCE_DIR"

# ── 헬퍼: 증거 파일 생성 (jq 사용으로 malformed JSON 방지) ──
write_evidence() {
  local status="$1" valid="$2" error="${3:-}"
  local end_time
  end_time=$(now_ms)
  local duration=$(( end_time - START_TIME ))

  if [ -n "$error" ]; then
    jq -n \
      --arg step "learn" \
      --arg status "$status" \
      --arg validated_at "$(now_iso)" \
      --arg file "$CONVENTIONS_FILE" \
      --arg schema "conventions" \
      --argjson valid "$valid" \
      --arg error "$error" \
      --argjson duration "$duration" \
      '{step: $step, status: $status, validated_at: $validated_at, outputs: [{file: $file, schema: $schema, valid: $valid, error: $error}], duration_ms: $duration}' \
      > "$EVIDENCE_FILE"
  else
    jq -n \
      --arg step "learn" \
      --arg status "$status" \
      --arg validated_at "$(now_iso)" \
      --arg file "$CONVENTIONS_FILE" \
      --arg schema "conventions" \
      --argjson valid "$valid" \
      --argjson duration "$duration" \
      '{step: $step, status: $status, validated_at: $validated_at, outputs: [{file: $file, schema: $schema, valid: $valid}], duration_ms: $duration}' \
      > "$EVIDENCE_FILE"
  fi
}

# 목적: conventions.json 존재 확인
if [ ! -f "$CONVENTIONS_FILE" ]; then
  log_error "conventions.json not found: $CONVENTIONS_FILE"
  write_evidence "failed" "false" "File not found"
  exit 1
fi

# 목적: conventions.json 스키마 검증
VALIDATION_OUTPUT=$(validate_json "conventions" "$CONVENTIONS_FILE" 2>&1) || {
  log_error "Schema validation failed: $VALIDATION_OUTPUT"
  write_evidence "failed" "false" "$VALIDATION_OUTPUT"
  exit 1
}

# 목적: 검증 성공 증거 파일 생성
write_evidence "validated" "true"

log_info "post-learn: conventions.json validated → ${EVIDENCE_FILE}"
