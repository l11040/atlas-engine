#!/usr/bin/env bash
# 목적: JSON Schema 검증 래퍼 (ajv-cli 또는 jq 기반 폴백)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_DIR="${SCRIPT_DIR}/../schemas"

usage() {
  echo "Usage: validate-schema.sh <schema-name> <json-file>"
  echo "  schema-name: schemas/ 하위 파일명 (.schema.json 제외)"
  echo "  json-file:   검증할 JSON 파일 경로"
  echo ""
  echo "Example: validate-schema.sh task-meta ./task.json"
  exit 1
}

if [ $# -lt 2 ]; then
  usage
fi

SCHEMA_NAME="$1"
JSON_FILE="$2"
SCHEMA_PATH="${SCHEMA_DIR}/${SCHEMA_NAME}.schema.json"

if [ ! -f "$SCHEMA_PATH" ]; then
  echo "ERROR: Schema not found: $SCHEMA_PATH" >&2
  exit 1
fi

if [ ! -f "$JSON_FILE" ]; then
  echo "ERROR: JSON file not found: $JSON_FILE" >&2
  exit 1
fi

# 목적: ajv-cli가 있으면 사용, 없으면 jq 기반 기본 검증
if command -v ajv &>/dev/null; then
  ajv validate -s "$SCHEMA_PATH" -d "$JSON_FILE" --spec=draft2020 2>&1
  exit $?
fi

# 주의: jq 폴백은 required 필드 존재 + JSON 유효성만 수행
if ! command -v jq &>/dev/null; then
  echo "ERROR: jq or ajv-cli required for schema validation" >&2
  exit 1
fi

if ! jq empty "$JSON_FILE" 2>/dev/null; then
  echo "FAIL: Invalid JSON in $JSON_FILE" >&2
  exit 1
fi

REQUIRED_FIELDS=$(jq -r '.required // [] | .[]' "$SCHEMA_PATH" 2>/dev/null)
ERRORS=0

for field in $REQUIRED_FIELDS; do
  if ! jq -e "has(\"$field\")" "$JSON_FILE" &>/dev/null; then
    echo "FAIL: Missing required field '$field' in $JSON_FILE" >&2
    ERRORS=$((ERRORS + 1))
  fi
done

if [ "$ERRORS" -gt 0 ]; then
  echo "FAIL: $ERRORS validation error(s)" >&2
  exit 1
fi

echo "OK: $JSON_FILE passes $SCHEMA_NAME schema (basic validation)"
exit 0
