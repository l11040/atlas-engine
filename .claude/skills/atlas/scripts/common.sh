#!/usr/bin/env bash
# 목적: 모든 스크립트와 Hook이 공유하는 헬퍼 함수 모음
set -euo pipefail

# 주의: 인라인 source 시 BASH_SOURCE가 비어있을 수 있다
if [ -n "${BASH_SOURCE[0]:-}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
fi
ATLAS_ROOT="${SCRIPT_DIR}/.."

# ── .env 로드 ──
# 주의: load_env 후 PROJECT_ROOT가 갱신되므로 AUTOMATION_PATH도 재계산한다
load_env() {
  local env_file="${1:-${ATLAS_ROOT}/.env}"
  if [ ! -f "$env_file" ]; then
    echo "ERROR: .env 파일이 없습니다: $env_file" >&2
    exit 1
  fi
  set -a
  source "$env_file"
  set +a
  # 이유: .env의 PROJECT_ROOT를 반영하여 경로 재계산
  _init_paths
}

_init_paths() {
  PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$ATLAS_ROOT/../../../.." && pwd)}"
  AUTOMATION_DIR="${AUTOMATION_DIR:-.automation}"
  AUTOMATION_PATH="${PROJECT_ROOT}/${AUTOMATION_DIR}"
}

# 목적: load_env 호출 전 기본값으로 초기화
_init_paths

# ── Run 관리 ──
# 목적: runs.json에서 활성 run ID를 조회한다
resolve_run() {
  local ticket_key="$1"
  local runs_file="${AUTOMATION_PATH}/runs.json"
  if [ ! -f "$runs_file" ]; then
    echo ""
    return
  fi
  jq -r --arg k "$ticket_key" '.active_runs[$k] // ""' "$runs_file" 2>/dev/null
}

# 목적: 새 run 디렉토리를 생성하고 runs.json에 등록한다
create_run() {
  local ticket_key="$1"
  local hash
  hash=$(openssl rand -hex 4)
  local run_id="${ticket_key}-${hash}"
  local run_dir="${AUTOMATION_PATH}/runs/${run_id}"
  local runs_file="${AUTOMATION_PATH}/runs.json"

  mkdir -p "$run_dir"
  mkdir -p "${run_dir}/tasks"
  mkdir -p "${run_dir}/evidence"

  # runs.json 갱신
  if [ ! -f "$runs_file" ]; then
    echo '{"active_runs":{}}' > "$runs_file"
  fi
  local tmp="${runs_file}.tmp"
  jq --arg k "$ticket_key" --arg v "$run_id" '.active_runs[$k] = $v' "$runs_file" > "$tmp" && mv "$tmp" "$runs_file"

  echo "$run_id"
}

# 목적: run ID에서 run 디렉토리 경로를 반환한다
run_dir_path() {
  local run_id="$1"
  echo "${AUTOMATION_PATH}/runs/${run_id}"
}

# ── 로그 출력 ──
log_info() {
  echo "[INFO] $(date '+%Y-%m-%d %H:%M:%S') $*"
}

log_warn() {
  echo "[WARN] $(date '+%Y-%m-%d %H:%M:%S') $*" >&2
}

log_error() {
  echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S') $*" >&2
}

# ── Task 관련 경로 헬퍼 ──
# 주의: RUN_DIR 환경변수가 설정되어 있어야 한다
task_dir() {
  local task_id="$1"
  echo "${RUN_DIR}/tasks/${task_id}"
}

task_meta() {
  local task_id="$1"
  echo "$(task_dir "$task_id")/meta/task.json"
}

task_status() {
  local task_id="$1"
  echo "$(task_dir "$task_id")/state/status.json"
}

task_artifacts() {
  local task_id="$1"
  echo "$(task_dir "$task_id")/artifacts/artifacts.json"
}

# ── 상태 관련 ──
# 목적: Task의 현재 status 문자열을 반환한다 (dependency 확인에 반복 사용)
read_task_status() {
  local task_id="$1"
  local status_file
  status_file="$(task_status "$task_id")"
  if [ ! -f "$status_file" ]; then
    echo "UNKNOWN"
    return 1
  fi
  jq -r '.status' "$status_file" 2>/dev/null || echo "UNKNOWN"
}

update_status() {
  local task_id="$1"
  local new_status="$2"
  local status_file
  status_file="$(task_status "$task_id")"

  if [ ! -f "$status_file" ]; then
    log_error "Status file not found: $status_file"
    return 1
  fi

  local tmp_file="${status_file}.tmp"
  jq --arg status "$new_status" \
     --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
     '.status = $status | .updated_at = $ts' \
     "$status_file" > "$tmp_file" && mv "$tmp_file" "$status_file"

  log_info "Task $task_id status → $new_status"
}

# ── Hook 실행 ──
run_hook() {
  local hook_path="$1"
  shift

  if [ ! -f "$hook_path" ]; then
    log_warn "Hook not found: $hook_path (skipped)"
    return 0
  fi

  if [ ! -x "$hook_path" ]; then
    chmod +x "$hook_path"
  fi

  local timeout_ms="${HOOK_TIMEOUT_MS:-10000}"
  local timeout_s=$(( timeout_ms / 1000 ))

  log_info "Running hook: $(basename "$hook_path")"
  if timeout "$timeout_s" bash "$hook_path" "$@"; then
    log_info "Hook passed: $(basename "$hook_path")"
    return 0
  else
    local exit_code=$?
    log_error "Hook failed: $(basename "$hook_path") (exit=$exit_code)"
    return "$exit_code"
  fi
}

# ── JSON 스키마 검증 ──
validate_json() {
  local schema_name="$1"
  local json_file="$2"
  local schema_path="${ATLAS_ROOT}/schemas/${schema_name}.schema.json"

  if [ ! -f "$schema_path" ]; then
    log_error "Schema not found: $schema_path"
    return 1
  fi

  if [ ! -f "$json_file" ]; then
    log_error "JSON file not found: $json_file"
    return 1
  fi

  bash "${ATLAS_ROOT}/scripts/validate-schema.sh" "$schema_name" "$json_file"
}

# ── 디렉토리 초기화 ──
ensure_automation_dir() {
  mkdir -p "${AUTOMATION_PATH}"
  mkdir -p "${AUTOMATION_PATH}/runs"
  mkdir -p "${AUTOMATION_PATH}/evidence"
}

# ── 타임스탬프 ──
now_iso() {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
}

# 이유: macOS의 date는 %3N(밀리초)을 지원하지 않으므로 python3 폴백 사용
now_ms() {
  python3 -c "import time; print(int(time.time()*1000))" 2>/dev/null || echo "$(date +%s)000"
}

# ── UUID 생성 (8자리 hex) ──
gen_task_id() {
  echo "TASK-$(openssl rand -hex 4)"
}
