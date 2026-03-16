---
name: analyze
description: >
  Jira 티켓을 재귀 수집하고 LLM이 Task로 분해한다. 레드팀 검증 후 tasks/ 개별 파일로 기록.
---

# /analyze — Jira 티켓 → Task 분해

## 목적

Jira 티켓을 수집하고, LLM이 직접 Task로 분해하여 `tasks/` 디렉토리에 개별 파일로 기록한다.

## 옵션

- `$1` (필수) — Jira 티켓 키 (예: `GRID-2`)
- `--force` → 새 run을 생성하여 재분석

## 실행 흐름

### 1. Run 결정

- `RUN_DIR`이 이미 설정되어 있으면 사용 (전체 파이프라인에서 전달)
- 없으면 `resolve_run()` / `create_run()`으로 결정

### 2. 기존 분석 확인

`${RUN_DIR}/evidence/analyze/done.json`이 존재하고 `status=done`이면:
- 기존 tasks/ 요약을 출력하고 **즉시 종료**

### 3. Jira 티켓 수집 (Setup)

```bash
python3 skills/analyze/scripts/fetch-ticket.py ${TICKET_KEY} \
  --env ${CLAUDE_SKILL_DIR}/.env \
  --run-dir ${RUN_DIR}
```

결과: `${RUN_DIR}/source.json`

**증거 기록 (필수):**

성공 시 → `${RUN_DIR}/evidence/analyze/fetch-ticket.json`:
```json
{
  "type": "script",
  "script": "fetch-ticket.py",
  "exit_code": 0,
  "output_summary": "L0: GRID-2, L1: 2 Stories, L2: 5 Subtasks",
  "artifacts": ["source.json"],
  "timestamp": "ISO-8601"
}
```

실패 시 → `${RUN_DIR}/evidence/analyze/fetch-ticket.error.json`:
```json
{
  "type": "script_error",
  "script": "fetch-ticket.py",
  "exit_code": 2,
  "stderr": "...",
  "diagnosis": "원인 분석",
  "timestamp": "ISO-8601"
}
```
실패 시 사용자에게 보고하고 파이프라인을 중단한다.

### 4. Task 분해 (LLM 자유 실행)

source.json을 읽고 **LLM이 직접** Task를 분해한다:

1. **source.json 분석** — 티켓 계층, AC, 엔티티, 정책을 파악한다
2. **conventions.json 대조** — AC와 conventions 사이 충돌을 감지한다 (아래 "Convention Override 감지" 참조)
3. **Task 목록 작성** — 각 L2 subtask를 기반으로 Task를 정의한다
4. **의존성 결정** — Task 간 의존 관계를 파악한다 (엔티티 → 레포지토리 → 서비스 등)
5. **개별 Task 파일 저장** — `${RUN_DIR}/tasks/` 디렉토리에 기록

**산출물 구조:**

`${RUN_DIR}/tasks/index.json`:
```json
{
  "ticket_key": "GRID-2",
  "task_ids": ["1", "2", "3"]
}
```

`${RUN_DIR}/tasks/task-1.json`:
```json
{
  "id": "1",
  "title": "Point 엔티티 생성",
  "description": "포인트 적립/차감을 위한 JPA 엔티티",
  "files": ["server/core/src/.../Point.java"],
  "depends_on": [],
  "ac": ["MUST: id, memberId, amount, type, createdAt 필드"],
  "status": "pending",
  "source_tickets": ["GRID-80"]
}
```

`schemas/analyze/task.schema.json`, `schemas/analyze/task-index.schema.json` 구조를 따른다.

#### Convention Override 감지

conventions.json을 읽고, 티켓 AC가 conventions와 다른 값을 **명시적으로** 요구하는 경우 해당 Task에 `overrides` 배열을 추가한다.

**감지 대상:**
- PK 전략 (Long vs UUID 등)
- 필드 타입 (Long vs BigDecimal 등)
- 상속 패턴 (BaseEntity 상속 vs 독자 구현)
- 네이밍 규칙 (snake_case vs camelCase 등)
- 기타 conventions.json `entity_patterns`, `production_rules`에 정의된 규칙

**규칙:**
1. AC가 conventions와 **같으면** — override 불필요 (생략)
2. AC가 conventions와 **다르면** — `overrides`에 `decision: "ac"` + 근거 티켓 명시
3. AC에 명시가 없고 conventions만 존재하면 — conventions를 따른다 (override 불필요)
4. 양쪽 모두 명시가 없는 항목 — override 불필요

**예시:**
```json
{
  "overrides": [
    {
      "convention": "pk_strategy: Long auto-increment",
      "ac_requires": "UUID BINARY(16)",
      "decision": "ac",
      "reason": "분산 환경 ID 충돌 방지, GRID-41 명시"
    }
  ]
}
```

**증거 기록:** → `${RUN_DIR}/evidence/analyze/decompose.json`:
```json
{
  "type": "llm_decision",
  "action": "task_decompose",
  "decisions": [{"task_id": "1", "title": "...", "files": [...]}],
  "reasoning": "분해 근거",
  "timestamp": "ISO-8601"
}
```

### 5. 레드팀 검증

task 파일들을 source.json 대비 비판적으로 검증한다:

**체크리스트:**
1. **커버리지** — source.json의 모든 L2 subtask가 task 파일에 매핑되었는가?
2. **의존성 완전성** — depends_on이 실제 의존 관계를 반영하는가? 순환이 없는가?
3. **파일 경로 실존** — files의 기존 파일 경로가 실제로 존재하는가? 새 파일은 conventions 패턴을 따르는가?
4. **AC 매핑** — source.json의 AC 항목이 모두 어떤 task에 할당되었는가?
5. **Override 타당성** — `overrides`가 있는 Task에서: AC가 실제로 해당 값을 요구하는가? 근거 티켓이 유효한가? conventions가 맞는데 불필요하게 override하지 않았는가?

문제 발견 시 해당 task 파일을 직접 수정한다.

**증거 기록:** → `${RUN_DIR}/evidence/analyze/redteam-decompose.json`:
```json
{
  "type": "redteam",
  "target": "decompose.json",
  "checks": [
    {"item": "커버리지", "result": "pass"},
    {"item": "의존성 완전성", "result": "fail", "detail": "..."}
  ],
  "fixes_applied": ["수정 내역"],
  "timestamp": "ISO-8601"
}
```

### 6. 완료 마커

모든 검증 통과 후 → `${RUN_DIR}/evidence/analyze/done.json`:
```json
{
  "type": "step_done",
  "step": "analyze",
  "status": "done",
  "summary": {"tasks_count": 5, "redteam_fixes": 1},
  "timestamp": "ISO-8601"
}
```

### 7. 결과 출력

1. 티켓 계층 요약 (L0 → L1 → L2)
2. Task 목록 (id, title, files, depends_on)
3. 레드팀 검증 결과
