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

# 목적: conventions.json 존재 확인
if [ ! -f "$CONVENTIONS_FILE" ]; then
  log_error "conventions.json not found: $CONVENTIONS_FILE"
  cat > "$EVIDENCE_FILE" <<EOF
{
  "step": "learn",
  "status": "failed",
  "validated_at": "$(now_iso)",
  "outputs": [
    {
      "file": "$CONVENTIONS_FILE",
      "schema": "conventions",
      "valid": false,
      "error": "File not found"
    }
  ]
}
EOF
  exit 1
fi

# 목적: conventions.json 스키마 검증
VALIDATION_OUTPUT=$(validate_json "conventions" "$CONVENTIONS_FILE" 2>&1) || {
  log_error "Schema validation failed: $VALIDATION_OUTPUT"
  END_TIME=$(now_ms)
  DURATION=$(( END_TIME - START_TIME ))
  cat > "$EVIDENCE_FILE" <<EOF
{
  "step": "learn",
  "status": "failed",
  "validated_at": "$(now_iso)",
  "outputs": [
    {
      "file": "$CONVENTIONS_FILE",
      "schema": "conventions",
      "valid": false,
      "error": "$VALIDATION_OUTPUT"
    }
  ],
  "duration_ms": $DURATION
}
EOF
  exit 1
}

END_TIME=$(now_ms)
DURATION=$(( END_TIME - START_TIME ))

# 목적: 검증 성공 증거 파일 생성
cat > "$EVIDENCE_FILE" <<EOF
{
  "step": "learn",
  "status": "validated",
  "validated_at": "$(now_iso)",
  "outputs": [
    {
      "file": "$CONVENTIONS_FILE",
      "schema": "conventions",
      "valid": true
    }
  ],
  "duration_ms": $DURATION
}
EOF

log_info "post-learn: conventions.json validated → ${EVIDENCE_FILE}"
