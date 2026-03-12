#!/usr/bin/env bash
# 목적: JSON Schema 검증 래퍼 (Python jsonschema → ajv → jq 폴백 체인)
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

# ── 1순위: Python jsonschema — draft2020 풀 검증 + format(date-time) 지원 ──
if python3 -c "import jsonschema" &>/dev/null; then
  python3 - "$SCHEMA_PATH" "$JSON_FILE" <<'PYEOF'
import json, sys
from jsonschema import validate, ValidationError, Draft202012Validator

schema_path, json_path = sys.argv[1], sys.argv[2]

with open(schema_path) as f:
    schema = json.load(f)
with open(json_path) as f:
    data = json.load(f)

try:
    validate(instance=data, schema=schema, cls=Draft202012Validator)
    print(f"OK: {json_path} passes {schema_path} schema")
except ValidationError as e:
    path = " → ".join(str(p) for p in e.absolute_path) if e.absolute_path else "(root)"
    print(f"FAIL: [{path}] {e.message}", file=sys.stderr)
    sys.exit(1)
PYEOF
  exit $?
fi

# ── 2순위: ajv-cli — draft2020 검증 (format 검증은 strict=false로 스킵) ──
if command -v ajv &>/dev/null; then
  ajv validate -s "$SCHEMA_PATH" -d "$JSON_FILE" --spec=draft2020 --strict=false 2>&1
  exit $?
fi

# ── 3순위: jq 폴백 — required 필드 존재 + JSON 유효성만 (최소 검증) ──
if ! command -v jq &>/dev/null; then
  echo "ERROR: python3+jsonschema, ajv, 또는 jq 중 하나가 필요합니다" >&2
  exit 1
fi

echo "WARN: jsonschema/ajv 미설치 — jq 기본 검증만 수행 (nested 미검증)" >&2

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
