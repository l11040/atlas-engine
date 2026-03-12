# Policy Registry 추출 및 매핑 규칙

## 개요

Story(L1) 레벨의 Policy Rules를 수집하여 `tickets/{KEY}/policy-registry.json`을 작성한다.
`schemas/policy-registry.schema.json` 구조를 따른다.

AC는 task.json에 내장되므로 여기서 추적하지 않는다.

## Policy 추출 규칙

| 소스 | 섹션 | ID 규칙 | 접근 경로 |
|------|------|---------|-----------|
| Story(L1) | `Policy Rules` | 원본 `POL-*` ID | `description.sections["Policy Rules"].items[]` |
| Subtask(L2) test | `Tested Policies` | 원본 `POL-*` ID | `description.sections["Tested Policies"].items[]` |

### 수집 순서

1. **Story의 Policy Rules에서 마스터 목록 수집** — defaults 포함
2. **Subtask의 Tested Policies에서 추가 수집** — Story에 없는 Policy가 있으면 추가 (POL-ADMIN-001 등)

### Policy 필드

- `id`: `POL-EARN-001` 등 원본 ID (레지스트리 키)
- `text`: Policy 원문
- `level`: `MUST`/`SHOULD`/`MAY`
- `defaults`: 파서가 추출한 key-value 기본값 객체
- `source_story`: Policy가 정의된 Story 키

## 매핑 규칙

task-plan의 `policy_refs`를 역참조하여 `implemented_by` / `tested_by`를 채운다:

- impl Task (labels=impl)의 `policy_refs` → `implemented_by`에 추가
- test Task (labels=test)의 `policy_refs` → `tested_by`에 추가

## Coverage 계산

- `total`: 전체 Policy 수
- `implemented`: `implemented_by`가 1개 이상인 Policy 수
- `tested`: `tested_by`가 1개 이상인 Policy 수
- `gaps`: 어떤 Task에도 매핑되지 않은 Policy ID 목록

## 상태 전이

| 단계 | status 값 | 갱신 주체 |
|------|-----------|-----------|
| analyze | `pending` | analyze 스킬 |
| execute | `in_progress` | execute 스킬 (Task 실행 시) |
| complete | `verified` / `failed` | complete 스킬 (검증 후) |
