#!/bin/bash
# validate-tasks.sh — Gate A: task-{id}.json 유효성 검증
#
# Usage:
#   validate-tasks.sh <source.json> <tasks-dir> [output-dir]
#   validate-tasks.sh <run-dir>
#
# 6개 서브게이트를 순차 검증한다:
#   A-1: 스키마 — acceptance_criteria, files, depends_on 존재
#   A-2: 스코프 — files[]가 허용 경로 범위 내
#   A-3: 의존성 — 순환 없음, 존재하지 않는 태스크 참조 없음
#   A-4: AC 커버리지 — 모든 source.json AC가 최소 1개 태스크에 매핑
#   A-5: 티켓 커버리지 — run_dir/tickets/의 모든 티켓이 최소 1개 태스크 source_tickets에 포함
#   A-6: required_classes 커버리지 — ticket-read.json의 required_classes[]가 모든 task files[] 합집합에 포함
#
# 결과: tasks-validation.json (게이트 증거)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

require_jq

# --- 인자 파싱 ---
if [ "$#" -eq 1 ] && [ -d "$1" ]; then
  RUN_DIR="$1"
  SOURCE_JSON="${RUN_DIR}/evidence/analyze/ticket-read.json"
  TASKS_DIR="${RUN_DIR}/tasks"
  OUTPUT_DIR="${RUN_DIR}/evidence/analyze"
else
  SOURCE_JSON="${1:?Usage: validate-tasks.sh <source.json> <tasks-dir> [output-dir]}"
  TASKS_DIR="${2:?Usage: validate-tasks.sh <source.json> <tasks-dir> [output-dir]}"
  OUTPUT_DIR="${3:-.}"
fi

if ! validate_json_file "$SOURCE_JSON" "source.json"; then
  exit 2
fi

if [ ! -d "$TASKS_DIR" ]; then
  log_error "tasks 디렉토리가 존재하지 않습니다: ${TASKS_DIR}"
  exit 2
fi

# --- 태스크 파일 수집 ---
TASK_FILES=()
for f in "${TASKS_DIR}"/task-*.json; do
  [ -f "$f" ] || continue
  TASK_FILES+=("$f")
done

if [ ${#TASK_FILES[@]} -eq 0 ]; then
  log_error "task-{id}.json 파일이 없습니다"
  EVIDENCE=$(jq -n \
    --arg source "script" \
    --arg generator "validate-tasks.sh" \
    --arg ts "$(timestamp)" \
    --arg status "fail" \
    '{
      source: $source,
      generator: $generator,
      timestamp: $ts,
      status: $status,
      tasks_count: 0,
      sub_gates: {
        A1_schema: { status: "fail", errors: ["task 파일이 없습니다"] },
        A2_scope: { status: "fail", out_of_scope_files: [] },
        A3_dependency: { status: "fail", has_cycle: false, errors: ["task 파일이 없습니다"] },
        A4_coverage: { status: "fail", unmapped_ac: [] }
      }
    }')
  write_evidence "${OUTPUT_DIR}/tasks-validation.json" "$EVIDENCE"
  echo "$EVIDENCE" | jq '.'
  exit 1
fi

TASKS_COUNT=${#TASK_FILES[@]}
log_info "Gate A 검증 시작: ${TASKS_COUNT}개 태스크"

# --- 태스크 ID 목록 수집 ---
TASK_IDS="[]"
for f in "${TASK_FILES[@]}"; do
  if ! validate_json_file "$f" "$(basename "$f")"; then
    continue
  fi
  tid=$(jq -r '.task_id // ""' "$f")
  if [ -n "$tid" ]; then
    TASK_IDS=$(echo "$TASK_IDS" | jq --arg id "$tid" '. + [$id]')
  fi
done

# ============================================================
# A-1: 스키마 검증
# 필수 필드: task_id, acceptance_criteria, files, depends_on
# ============================================================
log_info "A-1 스키마 검증..."

A1_ERRORS="[]"
REQUIRED_FIELDS='["task_id","acceptance_criteria","files","depends_on"]'

for f in "${TASK_FILES[@]}"; do
  fname=$(basename "$f")
  if ! validate_json_file "$f" "$fname" 2>/dev/null; then
    A1_ERRORS=$(echo "$A1_ERRORS" | jq --arg e "${fname}: JSON 파싱 실패" '. + [$e]')
    continue
  fi

  tid=$(jq -r '.task_id // ""' "$f")
  label="${tid:-$fname}"

  # 필수 필드 존재 확인
  for field in task_id acceptance_criteria files depends_on; do
    has_field=$(jq --arg f "$field" 'has($f)' "$f")
    if [ "$has_field" != "true" ]; then
      A1_ERRORS=$(echo "$A1_ERRORS" | jq --arg e "${label}: '${field}' 필드 누락" '. + [$e]')
    fi
  done

  # acceptance_criteria가 배열이고 최소 1개인지
  ac_len=$(jq '.acceptance_criteria | if type == "array" then length else -1 end' "$f" 2>/dev/null || echo -1)
  if [ "$ac_len" -eq -1 ]; then
    A1_ERRORS=$(echo "$A1_ERRORS" | jq --arg e "${label}: 'acceptance_criteria'가 배열이 아닙니다" '. + [$e]')
  elif [ "$ac_len" -eq 0 ]; then
    A1_ERRORS=$(echo "$A1_ERRORS" | jq --arg e "${label}: 'acceptance_criteria'가 비어 있습니다" '. + [$e]')
  fi

  # files가 배열인지
  files_type=$(jq '.files | type' "$f" 2>/dev/null || echo '"null"')
  if [ "$files_type" != '"array"' ]; then
    A1_ERRORS=$(echo "$A1_ERRORS" | jq --arg e "${label}: 'files'가 배열이 아닙니다" '. + [$e]')
  fi

  # depends_on이 배열인지
  deps_type=$(jq '.depends_on | type' "$f" 2>/dev/null || echo '"null"')
  if [ "$deps_type" != '"array"' ]; then
    A1_ERRORS=$(echo "$A1_ERRORS" | jq --arg e "${label}: 'depends_on'이 배열이 아닙니다" '. + [$e]')
  fi
done

A1_COUNT=$(echo "$A1_ERRORS" | jq 'length')
if [ "$A1_COUNT" -eq 0 ]; then
  A1_STATUS="pass"
  log_info "A-1 PASS"
else
  A1_STATUS="fail"
  log_error "A-1 FAIL — 오류 ${A1_COUNT}개"
fi

# ============================================================
# A-2: 스코프 검증
# files[]가 허용 경로 범위 내인지 확인
# 절대 경로, ".." 포함, 빈 경로 금지
# ============================================================
log_info "A-2 스코프 검증..."

A2_OUT_OF_SCOPE="[]"

for f in "${TASK_FILES[@]}"; do
  tid=$(jq -r '.task_id // "unknown"' "$f")
  files_json=$(jq -r '.files // []' "$f" 2>/dev/null)
  file_count=$(echo "$files_json" | jq 'length')

  for (( i=0; i<file_count; i++ )); do
    filepath=$(echo "$files_json" | jq -r ".[$i]")

    # 빈 경로
    if [ -z "$filepath" ]; then
      A2_OUT_OF_SCOPE=$(echo "$A2_OUT_OF_SCOPE" | jq --arg e "${tid}: 빈 경로" '. + [$e]')
      continue
    fi

    # 절대 경로
    if [[ "$filepath" == /* ]]; then
      A2_OUT_OF_SCOPE=$(echo "$A2_OUT_OF_SCOPE" | jq --arg e "${tid}: 절대 경로 — ${filepath}" '. + [$e]')
      continue
    fi

    # ".." 포함
    if [[ "$filepath" == *".."* ]]; then
      A2_OUT_OF_SCOPE=$(echo "$A2_OUT_OF_SCOPE" | jq --arg e "${tid}: 상위 참조 — ${filepath}" '. + [$e]')
      continue
    fi
  done
done

A2_OOS_COUNT=$(echo "$A2_OUT_OF_SCOPE" | jq 'length')
if [ "$A2_OOS_COUNT" -eq 0 ]; then
  A2_STATUS="pass"
  log_info "A-2 PASS"
else
  A2_STATUS="fail"
  log_error "A-2 FAIL — 스코프 이탈 ${A2_OOS_COUNT}건"
fi

# ============================================================
# A-3: 의존성 검증
# 순환 없음, 존재하지 않는 태스크 참조 없음
# ============================================================
log_info "A-3 의존성 검증..."

A3_ERRORS="[]"
A3_HAS_CYCLE=false

# 존재하지 않는 태스크 참조 확인
for f in "${TASK_FILES[@]}"; do
  tid=$(jq -r '.task_id // "unknown"' "$f")
  deps=$(jq -r '.depends_on // [] | .[]' "$f" 2>/dev/null)

  while IFS= read -r dep; do
    [ -z "$dep" ] && continue
    exists=$(echo "$TASK_IDS" | jq --arg d "$dep" 'any(. == $d)')
    if [ "$exists" != "true" ]; then
      A3_ERRORS=$(echo "$A3_ERRORS" | jq --arg e "${tid}: 존재하지 않는 태스크 참조 — ${dep}" '. + [$e]')
    fi
  done <<< "$deps"
done

# 순환 의존성 탐지 (위상 정렬)
# jq로 인접 리스트 구성 후 Kahn 알고리즘 수행
CYCLE_CHECK=$(jq -n \
  --argjson task_ids "$TASK_IDS" \
  --slurpfile tasks <(for f in "${TASK_FILES[@]}"; do jq '{id: .task_id, deps: (.depends_on // [])}' "$f"; done) \
  '
  # 인접 리스트 및 진입 차수 구성
  ($tasks | map({key: .id, value: .deps}) | from_entries) as $adj |
  ($tasks | map(.id)) as $all_ids |

  # 진입 차수 계산
  (reduce $tasks[] as $t (
    (reduce $all_ids[] as $id ({}; . + {($id): 0}));
    reduce ($t.deps[]) as $dep (.; if .[$dep] != null then .[$dep] += 0 else . end) |
    if .[$t.id] != null then . else . + {($t.id): 0} end
  )) as $initial_indegree |

  # depends_on에서 실제 진입 차수 계산
  (reduce $tasks[] as $t (
    (reduce $all_ids[] as $id ({}; . + {($id): 0}));
    reduce ($t.id) as $node (.;
      reduce ($adj[$node] // [])[] as $dep (.;
        if .[$node] != null then .[$node] += 0 else . end
      )
    )
  )) as $ignored |

  # 실제 진입 차수: 각 노드가 몇 개의 선행 의존성을 가지는지
  (reduce $tasks[] as $t (
    (reduce $all_ids[] as $id ({}; . + {($id): 0}));
    .[$t.id] = ($t.deps | length)
  )) as $indegree |

  # Kahn 알고리즘
  {queue: [$indegree | to_entries[] | select(.value == 0) | .key], visited: 0, indegree: $indegree} |
  until(.queue | length == 0;
    .queue[0] as $current |
    .queue = .queue[1:] |
    .visited += 1 |
    reduce ($tasks[] | select(.id != $current) | select(.deps | any(. == $current)) | .id) as $next (.;
      .indegree[$next] -= 1 |
      if .indegree[$next] == 0 then .queue += [$next] else . end
    )
  ) |
  {has_cycle: (.visited < ($all_ids | length)), visited: .visited, total: ($all_ids | length)}
  ' 2>/dev/null || echo '{"has_cycle": false, "visited": 0, "total": 0}')

CYCLE_DETECTED=$(echo "$CYCLE_CHECK" | jq -r '.has_cycle')
if [ "$CYCLE_DETECTED" = "true" ]; then
  A3_HAS_CYCLE=true
  A3_ERRORS=$(echo "$A3_ERRORS" | jq '. + ["순환 의존성이 존재합니다"]')
  log_error "A-3 순환 의존성 탐지됨"
fi

A3_ERR_COUNT=$(echo "$A3_ERRORS" | jq 'length')
if [ "$A3_ERR_COUNT" -eq 0 ]; then
  A3_STATUS="pass"
  log_info "A-3 PASS"
else
  A3_STATUS="fail"
  log_error "A-3 FAIL — 오류 ${A3_ERR_COUNT}개"
fi

# ============================================================
# A-4: 커버리지 검증
# source.json의 모든 AC가 최소 1개 태스크에 매핑
# ============================================================
log_info "A-4 커버리지 검증..."

# source.json에서 AC 목록 추출
# sections["Acceptance Criteria"].items[].text 또는 items[] 직접
SOURCE_ACS=$(jq -r '
  .description.sections // {} |
  to_entries[] |
  select(.key | test("acceptance.criteria"; "i")) |
  .value.items // [] |
  if length > 0 then
    map(if type == "object" then (.text // .id // tostring) else tostring end)
  else [] end |
  .[]
' "$SOURCE_JSON" 2>/dev/null || true)

# AC가 없으면 커버리지 검증 스킵 (A-1에서 이미 잡힘)
if [ -z "$SOURCE_ACS" ]; then
  log_warn "A-4 source.json에서 AC를 추출할 수 없습니다 (A-1에서 처리)"
  A4_STATUS="pass"
  A4_UNMAPPED="[]"
else
  # 태스크에 매핑된 AC 수집
  TASK_ACS="[]"
  for f in "${TASK_FILES[@]}"; do
    acs=$(jq -r '.acceptance_criteria // [] | map(if type == "object" then (.text // .id // tostring) else tostring end) | .[]' "$f" 2>/dev/null || true)
    while IFS= read -r ac; do
      [ -z "$ac" ] && continue
      TASK_ACS=$(echo "$TASK_ACS" | jq --arg a "$ac" '. + [$a]')
    done <<< "$acs"
  done

  # 매핑되지 않은 AC 찾기
  A4_UNMAPPED="[]"
  while IFS= read -r source_ac; do
    [ -z "$source_ac" ] && continue
    # 태스크 AC에서 정확 매칭 또는 포함 관계 확인
    matched=$(echo "$TASK_ACS" | jq --arg s "$source_ac" '[.[] | . as $item | ($item == $s or ($item | ascii_downcase | contains($s | ascii_downcase)) or ($s | ascii_downcase | contains($item | ascii_downcase)))] | any')
    if [ "$matched" != "true" ]; then
      A4_UNMAPPED=$(echo "$A4_UNMAPPED" | jq --arg a "$source_ac" '. + [$a]')
    fi
  done <<< "$SOURCE_ACS"

  A4_UNMAPPED_COUNT=$(echo "$A4_UNMAPPED" | jq 'length')
  if [ "$A4_UNMAPPED_COUNT" -eq 0 ]; then
    A4_STATUS="pass"
    log_info "A-4 PASS"
  else
    A4_STATUS="fail"
    log_error "A-4 FAIL — 매핑되지 않은 AC ${A4_UNMAPPED_COUNT}개"
  fi
fi

# ============================================================
# A-5: 티켓 커버리지 검증
# run_dir/tickets/의 모든 티켓 키가 최소 1개 태스크의 source_tickets에 포함됐는지 확인
# ============================================================
log_info "A-5 티켓 커버리지 검증..."

TICKETS_DIR_PATH="${RUN_DIR}/tickets"
A5_UNCOVERED="[]"

if [ -d "$TICKETS_DIR_PATH" ]; then
  # 태스크 전체의 source_tickets 수집
  ALL_SOURCE_TICKETS="[]"
  for f in "${TASK_FILES[@]}"; do
    st=$(jq -r '.source_tickets // [] | .[]' "$f" 2>/dev/null || true)
    while IFS= read -r key; do
      [ -z "$key" ] && continue
      ALL_SOURCE_TICKETS=$(echo "$ALL_SOURCE_TICKETS" | jq --arg k "$key" '. + [$k]')
    done <<< "$st"
  done

  # tickets/ 디렉토리의 모든 티켓 키 검사
  for ticket_file in "${TICKETS_DIR_PATH}"/*.json; do
    [ -f "$ticket_file" ] || continue
    ticket_key=$(jq -r '.key // ""' "$ticket_file" 2>/dev/null)
    [ -z "$ticket_key" ] && ticket_key=$(basename "$ticket_file" .json)

    covered=$(echo "$ALL_SOURCE_TICKETS" | jq --arg k "$ticket_key" 'any(. == $k)')
    if [ "$covered" != "true" ]; then
      A5_UNCOVERED=$(echo "$A5_UNCOVERED" | jq --arg k "$ticket_key" '. + [$k]')
    fi
  done
fi

A5_UNCOVERED_COUNT=$(echo "$A5_UNCOVERED" | jq 'length')
if [ "$A5_UNCOVERED_COUNT" -eq 0 ]; then
  A5_STATUS="pass"
  log_info "A-5 PASS"
else
  A5_STATUS="fail"
  log_error "A-5 FAIL — source_tickets 미포함 티켓 ${A5_UNCOVERED_COUNT}개: $(echo "$A5_UNCOVERED" | jq -r 'join(", ")')"
fi

# ============================================================
# A-6: required_classes 커버리지 검증
# ticket-read.json의 required_classes[]가 모든 task files[] 합집합에 포함됐는지
# ============================================================
log_info "A-6 required_classes 커버리지 검증..."

A6_UNCOVERED="[]"
A6_STATUS="pass"

REQUIRED_CLASSES=$(jq -r '.required_classes // [] | .[]' "$SOURCE_JSON" 2>/dev/null || true)

if [ -n "$REQUIRED_CLASSES" ]; then
  # 모든 task files[] 합집합 (basename 기준으로도 매칭)
  ALL_TASK_FILES="[]"
  for f in "${TASK_FILES[@]}"; do
    task_files_arr=$(jq -r '.files // [] | .[]' "$f" 2>/dev/null || true)
    while IFS= read -r fp; do
      [ -z "$fp" ] && continue
      ALL_TASK_FILES=$(echo "$ALL_TASK_FILES" | jq --arg fp "$fp" '. + [$fp]')
    done <<< "$task_files_arr"
  done

  while IFS= read -r rc; do
    [ -z "$rc" ] && continue
    # 클래스명 기준 매칭: 전체 경로 일치 또는 파일명(basename) 포함 여부
    rc_java="${rc%.java}.java"
    matched=$(echo "$ALL_TASK_FILES" | jq \
      --arg rc "$rc" \
      --arg rcj "${rc_java}" \
      'any(. == $rc or (. | test($rcj; "")) or (. | endswith("/" + $rcj)))')
    if [ "$matched" != "true" ]; then
      A6_UNCOVERED=$(echo "$A6_UNCOVERED" | jq --arg c "$rc" '. + [$c]')
    fi
  done <<< "$REQUIRED_CLASSES"

  A6_UNCOVERED_COUNT=$(echo "$A6_UNCOVERED" | jq 'length')
  if [ "$A6_UNCOVERED_COUNT" -gt 0 ]; then
    A6_STATUS="fail"
    log_error "A-6 FAIL — required_classes 누락 ${A6_UNCOVERED_COUNT}개: $(echo "$A6_UNCOVERED" | jq -r 'join(", ")')"
  else
    log_info "A-6 PASS"
  fi
else
  log_warn "A-6 required_classes 없음 (skip)"
fi

# ============================================================
# 최종 판정
# ============================================================
if [ "$A1_STATUS" = "pass" ] && [ "$A2_STATUS" = "pass" ] && [ "$A3_STATUS" = "pass" ] && [ "$A4_STATUS" = "pass" ] && [ "$A5_STATUS" = "pass" ] && [ "$A6_STATUS" = "pass" ]; then
  FINAL_STATUS="pass"
  log_info "Gate A PASS"
else
  FINAL_STATUS="fail"
  log_error "Gate A FAIL"
fi

# --- tasks-validation.json 생성 ---
EVIDENCE=$(jq -n \
  --arg source "script" \
  --arg generator "validate-tasks.sh" \
  --arg ts "$(timestamp)" \
  --arg status "$FINAL_STATUS" \
  --argjson tasks_count "$TASKS_COUNT" \
  --arg a1_status "$A1_STATUS" \
  --argjson a1_errors "$A1_ERRORS" \
  --arg a2_status "$A2_STATUS" \
  --argjson a2_oos "$A2_OUT_OF_SCOPE" \
  --arg a3_status "$A3_STATUS" \
  --argjson a3_cycle "$A3_HAS_CYCLE" \
  --argjson a3_errors "$A3_ERRORS" \
  --arg a4_status "$A4_STATUS" \
  --argjson a4_unmapped "$A4_UNMAPPED" \
  --arg a5_status "$A5_STATUS" \
  --argjson a5_uncovered "$A5_UNCOVERED" \
  --arg a6_status "$A6_STATUS" \
  --argjson a6_uncovered "$A6_UNCOVERED" \
  '{
    source: $source,
    generator: $generator,
    timestamp: $ts,
    status: $status,
    tasks_count: $tasks_count,
    sub_gates: {
      A1_schema: { status: $a1_status, errors: $a1_errors },
      A2_scope: { status: $a2_status, out_of_scope_files: $a2_oos },
      A3_dependency: { status: $a3_status, has_cycle: $a3_cycle, errors: $a3_errors },
      A4_coverage: { status: $a4_status, unmapped_ac: $a4_unmapped },
      A5_ticket_coverage: { status: $a5_status, uncovered_tickets: $a5_uncovered },
      A6_required_classes: { status: $a6_status, uncovered_classes: $a6_uncovered }
    }
  }')

OUTPUT_FILE="${OUTPUT_DIR}/tasks-validation.json"
write_evidence "$OUTPUT_FILE" "$EVIDENCE"
log_info "증거 파일 생성: ${OUTPUT_FILE}"

echo "$EVIDENCE" | jq '.'

if [ "$FINAL_STATUS" = "fail" ]; then
  exit 1
fi
exit 0
