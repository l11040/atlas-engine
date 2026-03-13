#!/usr/bin/env bash
# 목적: v3 공유 헬퍼 — env 로드 + run 관리 + 로그 출력
# 주의: source 시 호출 셸에 영향을 주지 않도록 직접 실행 시에만 strict mode 적용
if [[ "${BASH_SOURCE[0]:-}" == "${0}" ]]; then
  set -euo pipefail
fi

# 주의: 인라인 source 시 BASH_SOURCE가 비어있을 수 있다
if [ -n "${BASH_SOURCE[0]:-}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
fi
ATLAS_ROOT="${SCRIPT_DIR}/.."

# ── 경로 초기화 ──
_init_paths() {
  PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$ATLAS_ROOT/../../../.." && pwd)}"
  AUTOMATION_DIR="${AUTOMATION_DIR:-.automation}"
  AUTOMATION_PATH="${PROJECT_ROOT}/${AUTOMATION_DIR}"
}
_init_paths

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
  _init_paths
}

# ── Run 관리 ──
resolve_run() {
  local ticket_key="$1"
  local runs_file="${AUTOMATION_PATH}/runs.json"
  if [ ! -f "$runs_file" ]; then
    echo ""
    return
  fi
  jq -r --arg k "$ticket_key" '.active_runs[$k] // ""' "$runs_file" 2>/dev/null
}

create_run() {
  local ticket_key="$1"
  local ts
  ts=$(date '+%Y%m%d-%H%M%S')
  local run_id="${ticket_key}-${ts}"
  local run_dir="${AUTOMATION_PATH}/runs/${run_id}"
  local runs_file="${AUTOMATION_PATH}/runs.json"

  mkdir -p "$run_dir"
  mkdir -p "${run_dir}/tasks"
  mkdir -p "${run_dir}/evidence/learn"
  mkdir -p "${run_dir}/evidence/analyze"
  mkdir -p "${run_dir}/evidence/execute"

  if [ ! -f "$runs_file" ]; then
    echo '{"active_runs":{}}' > "$runs_file"
  fi
  local tmp="${runs_file}.tmp"
  jq --arg k "$ticket_key" --arg v "$run_id" '.active_runs[$k] = $v' "$runs_file" > "$tmp" && mv "$tmp" "$runs_file"

  echo "$run_id"
}

# 목적: 기존 run을 archived_runs로 이동하고 active에서 제거한다
archive_run() {
  local ticket_key="$1"
  local runs_file="${AUTOMATION_PATH}/runs.json"
  if [ ! -f "$runs_file" ]; then
    return
  fi
  local old_run_id
  old_run_id=$(jq -r --arg k "$ticket_key" '.active_runs[$k] // ""' "$runs_file" 2>/dev/null)
  if [ -z "$old_run_id" ]; then
    return
  fi
  local tmp="${runs_file}.tmp"
  jq --arg k "$ticket_key" --arg v "$old_run_id" --arg ts "$(now_iso)" '
    .archived_runs = (.archived_runs // []) + [{
      "run_id": $v,
      "ticket_key": $k,
      "archived_at": $ts
    }] |
    del(.active_runs[$k])
  ' "$runs_file" > "$tmp" && mv "$tmp" "$runs_file"
  log_info "Archived run: ${old_run_id}"
}

# 목적: --force 시 기존 run을 아카이브하고 새 run을 생성한다
#   --force 없으면 기존 run을 이어서 사용한다
# 사용: resolve_or_create_run TICKET_KEY [--force]
# 주의: $()로 캡처하지 않는다 — RUN_ID, RUN_DIR을 직접 설정한다
resolve_or_create_run() {
  local ticket_key="$1"
  local force=false
  shift
  while [ $# -gt 0 ]; do
    case "$1" in
      --force) force=true; shift ;;
      *) shift ;;
    esac
  done

  ensure_automation_dir

  if [ "$force" = true ]; then
    archive_run "$ticket_key"
    RUN_ID=$(create_run "$ticket_key")
    log_info "Force: 새 run 생성 → ${RUN_ID}"
  else
    local existing
    existing=$(resolve_run "$ticket_key")
    if [ -n "$existing" ]; then
      RUN_ID="$existing"
      log_info "기존 run 재사용 → ${RUN_ID}"
    else
      RUN_ID=$(create_run "$ticket_key")
      log_info "새 run 생성 → ${RUN_ID}"
    fi
  fi

  RUN_DIR=$(run_dir_path "$RUN_ID")
  export RUN_ID RUN_DIR
}

run_dir_path() {
  local run_id="$1"
  echo "${AUTOMATION_PATH}/runs/${run_id}"
}

# ── 디렉토리 초기화 ──
ensure_automation_dir() {
  mkdir -p "${AUTOMATION_PATH}/runs"
}

# ── 로그 출력 ──
log_info()  { echo "[INFO] $(date '+%Y-%m-%d %H:%M:%S') $*"; }
log_warn()  { echo "[WARN] $(date '+%Y-%m-%d %H:%M:%S') $*" >&2; }
log_error() { echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S') $*" >&2; }

# ── 타임스탬프 ──
now_iso() {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
}

# ── Task 개별 파일 관리 ──

# 목적: 개별 task 파일을 읽는다
# 사용: read_task RUN_DIR TASK_ID → stdout에 JSON 출력
read_task() {
  local run_dir="$1" task_id="$2"
  local task_file="${run_dir}/tasks/task-${task_id}.json"
  if [ ! -f "$task_file" ]; then
    echo "" && return 1
  fi
  cat "$task_file"
}

# 목적: task의 현재 status를 읽는다
# 사용: get_task_status RUN_DIR TASK_ID → "pending" | "done" | ...
get_task_status() {
  local run_dir="$1" task_id="$2"
  local task_file="${run_dir}/tasks/task-${task_id}.json"
  jq -r '.status // "unknown"' "$task_file" 2>/dev/null
}

# 목적: task의 status를 변경하고 evidence를 자동 기록한다
# 사용: update_task_status RUN_DIR TASK_ID NEW_STATUS REASON [EVIDENCE_DATA]
# 주의: 이 함수를 통하지 않고 task status를 직접 수정하지 않는다
update_task_status() {
  local run_dir="$1" task_id="$2" new_status="$3" reason="${4:-}" evidence_data="${5:-}"
  local task_file="${run_dir}/tasks/task-${task_id}.json"
  local ts
  ts=$(now_iso)

  if [ ! -f "$task_file" ]; then
    log_error "Task 파일 없음: ${task_file}"
    return 1
  fi

  # 이전 상태 기록
  local old_status
  old_status=$(jq -r '.status' "$task_file" 2>/dev/null)

  # task 파일 status 갱신
  local tmp="${task_file}.tmp"
  jq --arg s "$new_status" --arg t "$ts" '.status = $s | .updated_at = $t' "$task_file" > "$tmp" && mv "$tmp" "$task_file"

  # 목적: 증거 자동 기록 — status 변경마다 trace를 남긴다
  local evidence_file="${run_dir}/evidence/execute/task-${task_id}-status-${new_status}.json"
  local evidence_json
  evidence_json=$(jq -n \
    --arg type "status_change" \
    --arg task_id "$task_id" \
    --arg from "$old_status" \
    --arg to "$new_status" \
    --arg reason "$reason" \
    --arg ts "$ts" \
    --arg data "$evidence_data" \
    '{
      type: $type,
      task_id: $task_id,
      transition: { from: $from, to: $to },
      reason: $reason,
      timestamp: $ts
    } + (if $data != "" then { data: ($data | fromjson? // $data) } else {} end)')
  echo "$evidence_json" > "$evidence_file"

  log_info "Task ${task_id}: ${old_status} → ${new_status} (${reason})"
}

# ── Execute 중간 증거 기록 ──

# 목적: 코드 생성 결정을 증거로 기록한다
# 사용: record_generate_evidence RUN_DIR TASK_ID FILES_CREATED FILES_MODIFIED
record_generate_evidence() {
  local run_dir="$1" task_id="$2" files_created="${3:-}" files_modified="${4:-}"
  local ts
  ts=$(now_iso)
  local evidence_file="${run_dir}/evidence/execute/task-${task_id}-generate.json"

  local created_json modified_json
  created_json=$(echo "$files_created" | tr ' ' '\n' | grep -v '^$' | jq -R . | jq -s . 2>/dev/null || echo '[]')
  modified_json=$(echo "$files_modified" | tr ' ' '\n' | grep -v '^$' | jq -R . | jq -s . 2>/dev/null || echo '[]')

  jq -n \
    --arg type "llm_decision" \
    --arg action "code_generate" \
    --arg task_id "$task_id" \
    --argjson files_created "$created_json" \
    --argjson files_modified "$modified_json" \
    --arg ts "$ts" \
    '{
      type: $type,
      action: $action,
      task_id: $task_id,
      files_created: $files_created,
      files_modified: $files_modified,
      timestamp: $ts
    }' > "$evidence_file"
}

# 목적: 레이어별 레드팀 검증 결과를 증거로 기록한다
# 사용: record_redteam_evidence RUN_DIR TASK_ID LAYER CHECKS_JSON [FIXES_JSON]
#   LAYER:       "domain" | "schema" | "repository" | "service" | "batch"
#   CHECKS_JSON: '[{"item":"FK 무결성","result":"pass","detail":"..."},...]'
#   FIXES_JSON:  '["수정 내용 1","수정 내용 2"]' (선택)
record_redteam_evidence() {
  local run_dir="$1" task_id="$2" layer="$3" checks_json="$4" fixes_json="${5:-[]}"
  local ts
  ts=$(now_iso)
  local evidence_file="${run_dir}/evidence/execute/task-${task_id}-redteam-${layer}.json"

  jq -n \
    --arg type "redteam" \
    --arg target "task-${task_id}-generate.json" \
    --arg layer "$layer" \
    --argjson checks "$checks_json" \
    --argjson fixes "$fixes_json" \
    --arg ts "$ts" \
    '{
      type: $type,
      target: $target,
      layer: $layer,
      checks: $checks,
      fixes_applied: $fixes,
      timestamp: $ts
    }' > "$evidence_file"
}

# 목적: 전체 레이어 레드팀 결과를 요약 증거로 기록한다
# 사용: record_redteam_summary RUN_DIR TASK_ID LAYERS_JSON TOTAL_FIXES
#   LAYERS_JSON: '[{"layer":"domain","pass":3,"fail":0},{"layer":"schema","pass":2,"fail":1}]'
record_redteam_summary() {
  local run_dir="$1" task_id="$2" layers_json="$3" total_fixes="${4:-0}"
  local ts
  ts=$(now_iso)
  local evidence_file="${run_dir}/evidence/execute/task-${task_id}-redteam-summary.json"

  jq -n \
    --arg type "redteam_summary" \
    --arg task_id "$task_id" \
    --argjson layers "$layers_json" \
    --argjson total_fixes "$total_fixes" \
    --arg ts "$ts" \
    '{
      type: $type,
      task_id: $task_id,
      layers: $layers,
      total_fixes: $total_fixes,
      timestamp: $ts
    }' > "$evidence_file"
}

# 목적: Step 스킵을 증거로 기록한다
# 사용: record_skip_evidence RUN_DIR STEP REASON
record_skip_evidence() {
  local run_dir="$1" step="$2" reason="$3"
  local ts
  ts=$(now_iso)
  local evidence_dir="${run_dir}/evidence/${step}"
  mkdir -p "$evidence_dir"
  local evidence_file="${evidence_dir}/done.json"

  jq -n \
    --arg type "step_done" \
    --arg step "$step" \
    --arg status "skipped" \
    --arg reason "$reason" \
    --arg ts "$ts" \
    '{
      type: $type,
      step: $step,
      status: $status,
      reason: $reason,
      timestamp: $ts
    }' > "$evidence_file"
}

# ── Step 완료 기록 ──

# 목적: Step 완료를 done.json으로 기록한다
# 사용: record_step_done RUN_DIR STEP SUMMARY
record_step_done() {
  local run_dir="$1" step="$2" summary="${3:-}"
  local ts
  ts=$(now_iso)
  local evidence_dir="${run_dir}/evidence/${step}"
  mkdir -p "$evidence_dir"
  local evidence_file="${evidence_dir}/done.json"

  jq -n \
    --arg type "step_done" \
    --arg step "$step" \
    --arg status "done" \
    --arg summary "$summary" \
    --arg ts "$ts" \
    '{
      type: $type,
      step: $step,
      status: $status,
      summary: $summary,
      timestamp: $ts
    }' > "$evidence_file"
}

# ── Task 완료 일괄 처리 ──

# 목적: commit evidence 기록 — task별 커밋 정보를 증거로 남긴다
# 사용: record_commit_evidence RUN_DIR TASK_ID COMMIT_HASH COMMIT_MESSAGE FILES
record_commit_evidence() {
  local run_dir="$1" task_id="$2" commit_hash="$3" commit_message="${4:-}" files="${5:-}"
  local ts
  ts=$(now_iso)
  local evidence_file="${run_dir}/evidence/execute/task-${task_id}-commit.json"

  # 목적: files 문자열을 JSON 배열로 변환한다
  local files_json
  if [ -n "$files" ]; then
    files_json=$(echo "$files" | tr ' ' '\n' | grep -v '^$' | jq -R . | jq -s .)
  else
    # 주의: files 미전달 시 git에서 커밋에 포함된 파일 목록을 자동 추출한다
    files_json=$(cd "$PROJECT_ROOT" && git diff-tree --no-commit-id --name-only -r "$commit_hash" 2>/dev/null | jq -R . | jq -s . 2>/dev/null || echo '[]')
  fi

  jq -n \
    --arg type "commit" \
    --arg task_id "$task_id" \
    --arg commit_hash "$commit_hash" \
    --arg message "$commit_message" \
    --arg ts "$ts" \
    --argjson files "$files_json" \
    '{
      type: $type,
      task_id: $task_id,
      commit_hash: $commit_hash,
      message: $message,
      files: $files,
      timestamp: $ts
    }' > "$evidence_file"
}

# 목적: Task 완료를 일괄 처리한다 — status 변경 + commit evidence를 한 번에 기록
# 사용: complete_task RUN_DIR TASK_ID COMMIT_HASH COMMIT_MESSAGE [FILES]
# 주의: 이 함수 하나로 update_task_status + record_commit_evidence를 대체한다
complete_task() {
  local run_dir="$1" task_id="$2" commit_hash="$3" commit_message="${4:-}" files="${5:-}"

  update_task_status "$run_dir" "$task_id" "done" "validate 통과 + 커밋 완료 (${commit_hash})"
  record_commit_evidence "$run_dir" "$task_id" "$commit_hash" "$commit_message" "$files"
}

# 목적: tasks/index.json에서 전체 task ID 목록을 읽는다
list_task_ids() {
  local run_dir="$1"
  local index_file="${run_dir}/tasks/index.json"
  if [ ! -f "$index_file" ]; then
    echo "" && return 1
  fi
  jq -r '.task_ids[]' "$index_file" 2>/dev/null
}
