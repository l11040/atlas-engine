#!/bin/bash
# validate-source.sh — Gate 0: source.json 유효성 검증
#
# Usage: validate-source.sh <source.json> [output-dir]
#
# 티켓 유형별 프로파일을 결정하고, 프로파일별 필수 섹션 존재 여부를 검증한다.
# description 포맷: { raw_text, sections: { "Section Name": { type, items } } }
# 결과: source-validation.json (게이트 증거)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

require_jq

# --- 인자 파싱 ---
SOURCE_JSON="${1:?Usage: validate-source.sh <source.json> [output-dir]}"
OUTPUT_DIR="${2:-.}"

PROFILES_JSON="${SCRIPT_DIR}/../config/gate0-profiles.json"

if ! validate_json_file "$SOURCE_JSON" "source.json"; then
  exit 1
fi

if ! validate_json_file "$PROFILES_JSON" "gate0-profiles.json"; then
  exit 1
fi

# --- 티켓 메타데이터 추출 ---
TICKET_KEY=$(jq -r '.key // ""' "$SOURCE_JSON")
ISSUETYPE=$(jq -r '.issuetype // ""' "$SOURCE_JSON")
SUMMARY=$(jq -r '.summary // ""' "$SOURCE_JSON")
LABELS=$(jq -r '.labels // [] | join(",")' "$SOURCE_JSON")

# description.sections 키 목록
SECTION_KEYS=$(jq -r '.description.sections // {} | keys[]' "$SOURCE_JSON" 2>/dev/null || true)

log_info "Gate 0 검증 시작: ${TICKET_KEY} (${ISSUETYPE})"

# --- 프로파일 결정 ---
determine_profile() {
  local profile=""
  local match_reason=""

  # 1. entity
  if echo "$ISSUETYPE" | grep -qi "엔티티"; then
    profile="entity"; match_reason="issuetype contains '엔티티'"
  elif echo "$LABELS" | grep -qi "entity"; then
    profile="entity"; match_reason="labels contains 'entity'"
  elif echo "$SECTION_KEYS" | grep -qi "Entity"; then
    if ! echo "$LABELS" | grep -qi "api\|batch"; then
      profile="entity"; match_reason="sections contains Entity key"
    fi
  fi

  # 2. api
  if [ -z "$profile" ]; then
    if echo "$ISSUETYPE" | grep -qi "API"; then
      profile="api"; match_reason="issuetype contains 'API'"
    elif echo "$LABELS" | grep -qi "api"; then
      profile="api"; match_reason="labels contains 'api'"
    elif echo "$SECTION_KEYS" | grep -qi "API Spec"; then
      profile="api"; match_reason="sections contains 'API Spec'"
    fi
  fi

  # 3. test (labels 기반 — batch summary 매칭보다 우선)
  if [ -z "$profile" ]; then
    if [ "$ISSUETYPE" = "하위 작업" ] && echo "$LABELS" | grep -qi "test"; then
      profile="test"; match_reason="issuetype='하위 작업' + labels contains 'test'"
    fi
  fi

  # 4. batch
  if [ -z "$profile" ]; then
    if echo "$LABELS" | grep -qi "batch"; then
      profile="batch"; match_reason="labels contains 'batch'"
    elif echo "$SUMMARY" | grep -qi "배치\|스케줄\|Batch"; then
      profile="batch"; match_reason="summary contains batch keyword"
    elif echo "$SECTION_KEYS" | grep -qi "Batch"; then
      profile="batch"; match_reason="sections contains Batch key"
    fi
  fi

  # 5. refactor
  if [ -z "$profile" ]; then
    if echo "$LABELS" | grep -qi "refactor"; then
      profile="refactor"; match_reason="labels contains 'refactor'"
    elif echo "$SUMMARY" | grep -qi "리팩터링\|리팩토링\|refactor"; then
      profile="refactor"; match_reason="summary contains refactor keyword"
    fi
  fi

  # 6. default
  if [ -z "$profile" ]; then
    profile="default"; match_reason="no specific profile matched"
  fi

  echo "${profile}|${match_reason}"
}

PROFILE_RESULT=$(determine_profile)
PROFILE=$(echo "$PROFILE_RESULT" | cut -d'|' -f1)
MATCH_REASON=$(echo "$PROFILE_RESULT" | cut -d'|' -f2)

log_info "프로파일 결정: ${PROFILE} (${MATCH_REASON})"

# --- 섹션 존재 여부 검증 ---
# section_pattern: "Entity Schemas|Entity Context" → "|" 구분 OR 매칭
check_section() {
  local section_pattern="$1"
  local found=false
  local count=0
  local matched_key=""

  IFS='|' read -ra alternatives <<< "$section_pattern"
  for alt in "${alternatives[@]}"; do
    [ -z "$alt" ] && continue
    # description.sections에서 키 매칭 (대소문자 무시, 부분 매칭)
    matched_key=$(jq -r --arg p "$alt" \
      '.description.sections // {} | keys[] | select(test($p; "i"))' \
      "$SOURCE_JSON" 2>/dev/null | head -1)

    if [ -n "$matched_key" ]; then
      found=true
      # items 배열 길이로 카운트
      count=$(jq --arg k "$matched_key" \
        'if .description.sections[$k].items then .description.sections[$k].items | length else 1 end' \
        "$SOURCE_JSON" 2>/dev/null || echo 1)
      break
    fi
  done

  echo "${found}|${count}|${matched_key}"
}

# --- 프로파일에서 필수/선택 섹션 로드 ---
REQUIRED_RAW=$(jq -r --arg p "$PROFILE" \
  '[.profile_rules[] | select(.profile == $p) | .required_sections[]] | join("\n")' \
  "$PROFILES_JSON")

OPTIONAL_RAW=$(jq -r --arg p "$PROFILE" \
  '[.profile_rules[] | select(.profile == $p) | .optional_sections[]] | join("\n")' \
  "$PROFILES_JSON")

# --- 필수 섹션 검증 ---
REQUIRED_CHECKS="{}"
MISSING_REQUIRED="[]"

while IFS= read -r section_pattern; do
  [ -z "$section_pattern" ] && continue
  result=$(check_section "$section_pattern")
  exists=$(echo "$result" | cut -d'|' -f1)
  count=$(echo "$result" | cut -d'|' -f2)
  matched=$(echo "$result" | cut -d'|' -f3)

  REQUIRED_CHECKS=$(echo "$REQUIRED_CHECKS" | jq \
    --arg s "$section_pattern" \
    --arg m "$matched" \
    --argjson e "$( [ "$exists" = "true" ] && echo true || echo false )" \
    --argjson c "$count" \
    '. + {($s): {"exists": $e, "count": $c, "matched_key": $m}}')

  if [ "$exists" = "false" ]; then
    MISSING_REQUIRED=$(echo "$MISSING_REQUIRED" | jq --arg s "$section_pattern" '. + [$s]')
    log_error "필수 섹션 누락: ${section_pattern}"
  else
    log_info "필수 섹션 확인: ${matched} (count: ${count})"
  fi
done <<< "$REQUIRED_RAW"

# --- 선택 섹션 검증 ---
OPTIONAL_CHECKS="{}"
WARNINGS="[]"

while IFS= read -r section_pattern; do
  [ -z "$section_pattern" ] && continue
  result=$(check_section "$section_pattern")
  exists=$(echo "$result" | cut -d'|' -f1)
  count=$(echo "$result" | cut -d'|' -f2)
  matched=$(echo "$result" | cut -d'|' -f3)

  OPTIONAL_CHECKS=$(echo "$OPTIONAL_CHECKS" | jq \
    --arg s "$section_pattern" \
    --arg m "$matched" \
    --argjson e "$( [ "$exists" = "true" ] && echo true || echo false )" \
    --argjson c "$count" \
    '. + {($s): {"exists": $e, "count": $c, "matched_key": $m}}')

  if [ "$exists" = "false" ]; then
    WARNINGS=$(echo "$WARNINGS" | jq --arg s "${section_pattern} 미존재 (선택)" '. + [$s]')
    log_warn "선택 섹션 미존재: ${section_pattern}"
  else
    log_info "선택 섹션 확인: ${matched} (count: ${count})"
  fi
done <<< "$OPTIONAL_RAW"

# --- AC 최소 1개 검증 ---
AC_COUNT=0
AC_CHECK=$(echo "$REQUIRED_CHECKS" | jq -r '.["Acceptance Criteria"].count // 0')
AC_COUNT=$AC_CHECK

if [ "$AC_COUNT" -eq 0 ]; then
  # required에 AC가 없는 프로파일이라도 최소 1개 필수
  ac_result=$(check_section "Acceptance Criteria")
  ac_exists=$(echo "$ac_result" | cut -d'|' -f1)
  AC_COUNT=$(echo "$ac_result" | cut -d'|' -f2)

  if [ "$ac_exists" = "false" ] || [ "$AC_COUNT" -eq 0 ]; then
    MISSING_REQUIRED=$(echo "$MISSING_REQUIRED" | jq '. + ["Acceptance Criteria (최소 1개)"]')
    log_error "AC가 0개입니다"
  fi
fi

# --- PASS/FAIL 결정 ---
MISSING_COUNT=$(echo "$MISSING_REQUIRED" | jq 'length')

if [ "$MISSING_COUNT" -eq 0 ]; then
  STATUS="pass"
  log_info "Gate 0 PASS"
else
  STATUS="fail"
  log_error "Gate 0 FAIL — 누락 필수 섹션: ${MISSING_COUNT}개"
fi

# --- source-validation.json 생성 ---
EVIDENCE=$(jq -n \
  --arg source "script" \
  --arg generator "validate-source.sh" \
  --arg ts "$(timestamp)" \
  --arg status "$STATUS" \
  --arg profile "$PROFILE" \
  --arg match_reason "$MATCH_REASON" \
  --argjson required_checks "$REQUIRED_CHECKS" \
  --argjson optional_checks "$OPTIONAL_CHECKS" \
  --argjson missing_required "$MISSING_REQUIRED" \
  --argjson warnings "$WARNINGS" \
  --arg ticket_key "$TICKET_KEY" \
  '{
    source: $source,
    generator: $generator,
    timestamp: $ts,
    status: $status,
    ticket_key: $ticket_key,
    profile: $profile,
    profile_match_reason: $match_reason,
    required_checks: $required_checks,
    optional_checks: $optional_checks,
    missing_required: $missing_required,
    warnings: $warnings
  }')

OUTPUT_FILE="${OUTPUT_DIR}/source-validation.json"
write_evidence "$OUTPUT_FILE" "$EVIDENCE"
log_info "증거 파일 생성: ${OUTPUT_FILE}"

echo "$EVIDENCE" | jq '.'

if [ "$STATUS" = "fail" ]; then
  exit 1
fi
exit 0
