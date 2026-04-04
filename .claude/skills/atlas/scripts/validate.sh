#!/bin/bash
# validate.sh — Gate E-pre: 빌드/린트/스코프 검증
#
# Usage:
#   validate.sh <task.json> [output-dir] [project-root]
#   validate.sh <task-id> <run-dir> [project-root]
#
# 서브게이트:
#   E-1: scope   — files[]가 실제 존재하는지
#   E-2: build   — 프로젝트 빌드 성공 여부
#   E-3: lint    — 린트 규칙 위반 없음
#   E-4: domain  — 도메인 규칙 검증
#
# 결과: validate.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

require_jq

# --- 인자 파싱 ---
if [ "$#" -ge 2 ] && [ ! -f "$1" ] && [ -d "$2" ] && [ -f "${2}/tasks/${1}.json" ]; then
  TASK_ID="$1"
  RUN_DIR="$2"
  TASK_JSON="${RUN_DIR}/tasks/${TASK_ID}.json"
  OUTPUT_DIR="${RUN_DIR}/evidence/${TASK_ID}"
  PROJECT_ROOT="${3:-.}"
else
  TASK_JSON="${1:?Usage: validate.sh <task.json> [output-dir] [project-root]}"
  OUTPUT_DIR="${2:-.}"
  PROJECT_ROOT="${3:-.}"
fi

if ! validate_json_file "$TASK_JSON" "task.json"; then
  exit 2
fi

TASK_ID=$(jq -r '.task_id // "unknown"' "$TASK_JSON")
log_info "Gate E-pre 검증 시작: ${TASK_ID}"

mkdir -p "$OUTPUT_DIR"

# ============================================================
# E-1: 스코프 검증 — files[]의 파일이 실제 존재하는지
# ============================================================
log_info "E-1 스코프 검증..."

E1_MISSING="[]"
FILES_JSON=$(jq -r '.files // []' "$TASK_JSON")
FILE_COUNT=$(echo "$FILES_JSON" | jq 'length')

for (( i=0; i<FILE_COUNT; i++ )); do
  filepath=$(echo "$FILES_JSON" | jq -r ".[$i]")
  full_path="${PROJECT_ROOT}/${filepath}"

  if [ ! -f "$full_path" ]; then
    E1_MISSING=$(echo "$E1_MISSING" | jq --arg f "$filepath" '. + [$f]')
  fi
done

E1_MISSING_COUNT=$(echo "$E1_MISSING" | jq 'length')
if [ "$E1_MISSING_COUNT" -eq 0 ]; then
  E1_STATUS="pass"
  log_info "E-1 PASS — ${FILE_COUNT}개 파일 모두 존재"
else
  E1_STATUS="fail"
  log_error "E-1 FAIL — ${E1_MISSING_COUNT}개 파일 미존재"
fi

# ============================================================
# E-2: 빌드 검증
# ============================================================
log_info "E-2 빌드 검증..."

E2_STATUS="pass"
E2_OUTPUT=""

# 프로젝트 빌드 시스템 감지 후 컴파일 시도
if [ -f "${PROJECT_ROOT}/gradlew" ]; then
  if cd "$PROJECT_ROOT" && ./gradlew compileJava --no-daemon -q 2>&1; then
    E2_STATUS="pass"
    log_info "E-2 PASS — Gradle 컴파일 성공"
  else
    E2_STATUS="fail"
    E2_OUTPUT="Gradle compileJava 실패"
    log_error "E-2 FAIL — Gradle 컴파일 실패"
  fi
elif [ -f "${PROJECT_ROOT}/pom.xml" ]; then
  if cd "$PROJECT_ROOT" && mvn compile -q 2>&1; then
    E2_STATUS="pass"
    log_info "E-2 PASS — Maven 컴파일 성공"
  else
    E2_STATUS="fail"
    E2_OUTPUT="Maven compile 실패"
    log_error "E-2 FAIL — Maven 컴파일 실패"
  fi
else
  E2_STATUS="skip"
  log_warn "E-2 SKIP — 빌드 시스템 미감지"
fi

# ============================================================
# E-3: 린트 검증 (현재는 기본 체크만)
# ============================================================
log_info "E-3 린트 검증..."

E3_ERRORS="[]"

# 기본 린트: 파일에 하드코딩된 절대 경로가 있는지
for (( i=0; i<FILE_COUNT; i++ )); do
  filepath=$(echo "$FILES_JSON" | jq -r ".[$i]")
  full_path="${PROJECT_ROOT}/${filepath}"
  [ ! -f "$full_path" ] && continue

  # Java 파일의 기본 린트
  if [[ "$filepath" == *.java ]]; then
    # System.out.println 체크 (테스트 제외)
    if [[ "$filepath" != *"Test"* ]] && grep -qn "System\.out\.println" "$full_path" 2>/dev/null; then
      E3_ERRORS=$(echo "$E3_ERRORS" | jq --arg e "${filepath}: System.out.println 사용" '. + [$e]')
    fi
  fi
done

E3_COUNT=$(echo "$E3_ERRORS" | jq 'length')
if [ "$E3_COUNT" -eq 0 ]; then
  E3_STATUS="pass"
  log_info "E-3 PASS"
else
  E3_STATUS="fail"
  log_error "E-3 FAIL — 린트 오류 ${E3_COUNT}개"
fi

# ============================================================
# E-4: 도메인 린트 (프레임워크 기반)
# ============================================================
log_info "E-4 도메인 린트..."

E4_ERRORS="[]"

for (( i=0; i<FILE_COUNT; i++ )); do
  filepath=$(echo "$FILES_JSON" | jq -r ".[$i]")
  full_path="${PROJECT_ROOT}/${filepath}"
  [ ! -f "$full_path" ] && continue

  if [[ "$filepath" == *.java ]]; then
    # BaseException/IllegalStateException 사용 금지 (DomainException 통일)
    if grep -qn "throw new BaseException\|throw new IllegalStateException" "$full_path" 2>/dev/null; then
      E4_ERRORS=$(echo "$E4_ERRORS" | jq --arg e "${filepath}: BaseException/IllegalStateException 사용 (DomainException 사용 필요)" '. + [$e]')
    fi

    # Entity에서 @Setter 사용 금지
    if [[ "$filepath" == *"/domain/"* ]] || [[ "$filepath" == *"/entity/"* ]]; then
      if grep -qn "@Setter" "$full_path" 2>/dev/null; then
        E4_ERRORS=$(echo "$E4_ERRORS" | jq --arg e "${filepath}: 엔티티에 @Setter 사용 금지" '. + [$e]')
      fi
    fi
  fi
done

E4_COUNT=$(echo "$E4_ERRORS" | jq 'length')
if [ "$E4_COUNT" -eq 0 ]; then
  E4_STATUS="pass"
  log_info "E-4 PASS"
else
  E4_STATUS="fail"
  log_error "E-4 FAIL — 도메인 린트 오류 ${E4_COUNT}개"
fi

# ============================================================
# 최종 판정
# ============================================================
# build skip은 PASS로 취급
if [ "$E1_STATUS" = "pass" ] && \
   ([ "$E2_STATUS" = "pass" ] || [ "$E2_STATUS" = "skip" ]) && \
   [ "$E3_STATUS" = "pass" ] && \
   [ "$E4_STATUS" = "pass" ]; then
  FINAL_STATUS="pass"
  log_info "Gate E-pre validate PASS"
else
  FINAL_STATUS="fail"
  log_error "Gate E-pre validate FAIL"
fi

# --- validate.json 생성 ---
EVIDENCE=$(jq -n \
  --arg source "script" \
  --arg generator "validate.sh" \
  --arg ts "$(timestamp)" \
  --arg status "$FINAL_STATUS" \
  --arg task_id "$TASK_ID" \
  --argjson files_checked "$FILES_JSON" \
  --arg e1_status "$E1_STATUS" \
  --argjson e1_missing "$E1_MISSING" \
  --arg e2_status "$E2_STATUS" \
  --arg e2_output "${E2_OUTPUT:-}" \
  --arg e3_status "$E3_STATUS" \
  --argjson e3_errors "$E3_ERRORS" \
  --arg e4_status "$E4_STATUS" \
  --argjson e4_errors "$E4_ERRORS" \
  '{
    source: $source,
    generator: $generator,
    timestamp: $ts,
    status: $status,
    task_id: $task_id,
    files_checked: $files_checked,
    sub_gates: {
      E1_scope: { status: $e1_status, missing_files: $e1_missing },
      E2_build: { status: $e2_status, output: $e2_output },
      E3_lint: { status: $e3_status, errors: $e3_errors },
      E4_domain: { status: $e4_status, errors: $e4_errors }
    }
  }')

write_evidence "${OUTPUT_DIR}/validate.json" "$EVIDENCE"
log_info "증거 파일 생성: ${OUTPUT_DIR}/validate.json"

echo "$EVIDENCE" | jq '.'

if [ "$FINAL_STATUS" = "fail" ]; then
  exit 1
fi
exit 0
