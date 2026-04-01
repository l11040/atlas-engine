#!/bin/bash
# common.sh — Atlas v5 공통 유틸리티

set -euo pipefail

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ISO8601 타임스탬프
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

# jq 존재 확인
require_jq() {
  if ! command -v jq &>/dev/null; then
    log_error "jq가 설치되어 있지 않습니다"
    exit 1
  fi
}

# 파일 존재 + JSON 유효성 확인
validate_json_file() {
  local file="$1"
  local label="${2:-$file}"

  if [ ! -f "$file" ]; then
    log_error "${label} 파일이 존재하지 않습니다: ${file}"
    return 1
  fi

  if ! jq empty "$file" 2>/dev/null; then
    log_error "${label} 파일이 유효한 JSON이 아닙니다: ${file}"
    return 1
  fi

  return 0
}

# 증거 파일 쓰기 (atomic write via temp file)
write_evidence() {
  local output_path="$1"
  local json_content="$2"

  local dir
  dir=$(dirname "$output_path")
  mkdir -p "$dir"

  local tmp="${output_path}.tmp.$$"
  echo "$json_content" | jq '.' > "$tmp"
  mv "$tmp" "$output_path"
}
