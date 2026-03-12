---
name: analyze
description: >
  Jira 티켓을 재귀 수집하고 L2(하위 작업)를 Task로 1:1 매핑한다. AC는 Task에 내장하고,
  Policy는 policy-registry.json으로 추적한다. 티켓 분해, Task 스캐폴딩, 의존성 그래프 생성이 필요할 때 사용.
disable-model-invocation: true
---

# analyze — Jira 티켓 → Task 분해

Jira 티켓을 재귀 수집하고, L2(하위 작업)를 Task로 1:1 매핑하여 run 디렉토리에 저장한다.

## 옵션

- `$1` (필수) — Jira 티켓 키 (예: `GRID-2`)
- `--force` → 새 run을 생성하여 재분석

## 스크립트

- **`scripts/fetch-ticket.py`** — Jira API로 티켓 + 하위 티켓을 재귀 수집 → source.json
- **`scripts/decompose-tasks.py`** — source.json → skeleton 출력 / Task 디렉토리 스캐폴딩

## AC와 Policy의 소유 범위

| 항목 | 소유 범위 | 저장 위치 |
|------|-----------|-----------|
| AC | Subtask(L2) 고유 | `task.json.acceptance_criteria` |
| Policy | Story(L1) 공유 | `policy-registry.json` |

- AC는 각 Subtask의 description에서 추출하여 task.json에 직접 내장한다
- Policy는 Story에서 수집하여 policy-registry.json에 저장, Task는 policy_refs로 참조한다

## 실행 흐름

### 0. 사전 확인

```bash
bash hooks/pre-step/pre-analyze.sh
```

티켓 키 인자가 없으면 에러를 출력하고 종료한다.

### 1. Run 디렉토리 결정

- `--force` 또는 활성 run이 없으면: `common.sh`의 `create_run()`으로 새 run 생성
- 기존 run이 있고 `--force`가 없으면: `resolve_run()`으로 기존 run 이어서 진행
- `RUN_DIR` 환경변수를 설정한다

### 2. 기존 분석 결과 확인

`${RUN_DIR}/dependency-graph.json`이 이미 존재하고 `--force`가 없으면:
- 기존 분석 결과 요약을 출력하고 **즉시 종료**한다.

### 3. Jira 티켓 수집

```bash
python3 skills/analyze/scripts/fetch-ticket.py ${TICKET_KEY} \
  --env ${CLAUDE_SKILL_DIR}/.env \
  --run-dir ${RUN_DIR}
```

결과: `${RUN_DIR}/source.json`

### 4. Skeleton 추출 — LLM 분석용 입력 생성

```bash
python3 skills/analyze/scripts/decompose-tasks.py \
  --ticket-key ${TICKET_KEY} \
  --run-dir ${RUN_DIR} \
  --scaffold-only
```

stdout으로 L2 하위 작업 skeleton이 출력된다.

### 5. Task Plan 작성 — LLM이 수행

skeleton과 `PROJECT_ROOT/.automation/conventions.json`을 참조하여 **task-plan.json**을 작성한다.

task-plan.json의 각 Task에는:
- `acceptance_criteria`: Subtask의 AC를 `{level, text, status:"pending"}` 배열로 내장
- `policy_refs`: impl은 `Policy Rules` 섹션의 `POL-*` ID, test는 `Tested Policies` 섹션의 `POL-*` ID

필드 결정 규칙 상세는 [references/field-rules.md](references/field-rules.md) 참조.

### 6. Policy Registry 생성 — LLM이 수행

Story(L1)의 Policy Rules를 수집하여 `${RUN_DIR}/policy-registry.json`을 작성한다.
`schemas/policy-registry.schema.json` 구조를 따른다.

추출/매핑 규칙 상세는 [references/policy-registry-rules.md](references/policy-registry-rules.md) 참조.

### 7. Task 디렉토리 스캐폴딩

task-plan.json을 `${RUN_DIR}/task-plan.json`에 Write한 뒤 스크립트에 전달한다.

> 주의: `/tmp/task-plan.json` 등 고정 경로를 사용하면 이전 실행 잔재로 Write 도구가 실패할 수 있다. 반드시 run별 고유 경로를 사용한다.

```bash
python3 skills/analyze/scripts/decompose-tasks.py \
  --ticket-key ${TICKET_KEY} \
  --run-dir ${RUN_DIR} \
  --task-plan ${RUN_DIR}/task-plan.json
```

**산출물 (모두 `${RUN_DIR}/` 하위):**
- `tickets/{EPIC}/{STORY}/{SUBTASK}/ticket.json` — 계층형 티켓 트리 (L0/L1/L2 각각)
- `dependency-graph.json` — DAG (Jira key → Task ID 변환)
- `tasks/TASK-{hex}/meta/task.json` — task-meta 스키마 (AC 내장 + policy_refs)
- `tasks/TASK-{hex}/state/status.json` — 초기 PENDING
- `tasks/TASK-{hex}/artifacts/artifacts.json` — 빈 배열

> policy-registry.json은 스텝 6에서 LLM이 직접 생성한다 (스크립트 아님).

### 8. 검증 + 증거 생성

```bash
RUN_DIR=${RUN_DIR} bash hooks/post-step/post-analyze.sh
```

검증 대상: tickets/**/ticket.json (계층형), dependency-graph.json, task.json (전체), **policy-registry.json**

### 9. 결과 출력

1. 티켓 요약 (key, summary, type, status)
2. 계층 트리 시각화 (Epic → Story → Subtask/Task 매핑)
3. Task 목록 (ID, type, title, jira_key, AC 수, policy_refs)
4. 의존성 그래프 시각화 (텍스트 기반 DAG)
5. Policy 커버리지 요약 (implemented/tested/gaps)
6. 스키마 검증 결과

## Jira 계층 → Task 매핑

| Jira 레벨 | issuetype | 역할 | Task 생성 |
|-----------|-----------|------|-----------|
| L0 | 에픽 | 요구사항 전체 범위 → ticket.json | X |
| L1 | 스토리 | 기능 단위 그룹핑 → Story 컨텍스트 상속 + Policy 소스 | X |
| L2 | 하위 작업 | 실제 코드 작업 단위 → **Task 1:1 매핑** (AC 내장) | O |
