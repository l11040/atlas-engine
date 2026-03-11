# /analyze — Jira 티켓 → Task 분해

## 목적

Jira 티켓을 가져와 분석하고, 원자적(atomic) Task 목록으로 분해하여 `.automation/tasks/`에 저장한다.

## 옵션

- `$1` (필수) — Jira 티켓 키 (예: `GRID-123`)
- `--force` → 기존 분해 결과를 무시하고 재분석

## 실행 흐름

### 0. 사전 확인

1. pre-analyze Hook(`hooks/pre-step/pre-analyze.sh`)을 실행하여 `/learn` 증거를 확인한다.
2. 티켓 키 인자가 없으면 에러를 출력하고 종료한다.
3. `.env`에서 Jira API 설정(`JIRA_BASE_URL`, `JIRA_USER_EMAIL`, `JIRA_API_TOKEN`)을 확인한다.

### 1. 기존 분석 결과 확인

`PROJECT_ROOT/.automation/tickets/{TICKET_KEY}/ticket.json`이 이미 존재하고 `--force`가 없으면:
- 기존 분석 결과 요약을 출력하고 **즉시 종료**한다.
- "기존 분석 결과를 로드했습니다. 강제 재분석: `--force`" 메시지를 출력한다.

### 2. Jira 티켓 가져오기

`scripts/fetch-ticket.py`를 실행하여 티켓과 하위 티켓을 재귀적으로 수집한다:

```bash
python3 ${CLAUDE_SKILL_DIR}/skills/analyze/scripts/fetch-ticket.py ${TICKET_KEY} --env ${CLAUDE_SKILL_DIR}/.env
```

스크립트가 수행하는 작업:
- 최상위 티켓 기준으로 subtask + Epic 하위 이슈를 JQL로 재귀 탐색
- Atlassian Document Format(ADF) description을 평문으로 변환
- parent 필드 기반으로 `hierarchy` (부모 → 자식 배열) 생성
- 결과를 `PROJECT_ROOT/.automation/tickets/{TICKET_KEY}/source.json`에 저장

저장 구조:
```json
{
  "root": "GRID-2",
  "hierarchy": {
    "GRID-2": ["GRID-21", "GRID-7", "GRID-13", "GRID-14", "GRID-16"],
    "GRID-21": ["GRID-79", "GRID-80", "GRID-81", "GRID-82"],
    "GRID-7": ["GRID-25", "GRID-26", "GRID-27", "GRID-28", "GRID-29", "GRID-30"]
  },
  "tickets": { "GRID-2": { ... }, "GRID-21": { ... }, ... }
}
```

### 3. 계층 분류

`source.json`의 `hierarchy`와 각 티켓의 `issuetype`을 기반으로 계층을 분류한다:

| 레벨 | Jira issuetype | 역할 | Task 생성 |
|------|----------------|------|-----------|
| L0 | 에픽 (Epic) | 요구사항 전체 범위. ticket.json의 소스 | X |
| L1 | 스토리 (Story) | 기능 단위 그룹핑. Task의 그룹 메타데이터 | X |
| L2 | 하위 작업 (Subtask) | 실제 코드 작업 단위. **Task 1:1 매핑** | O |

- **Task는 L2(하위 작업)에서만 생성한다.**
- L0(Epic), L1(Story)은 ticket.json과 의존성 그래프의 컨텍스트로만 사용한다.
- L1 Story의 description에 포함된 AC, Policy, Procedure는 해당 Story 하위 Task들의 공유 컨텍스트로 전달한다.

### 4. Acceptance Criteria 추출

`source.json`의 각 티켓 `description`(평문)에서 인수 조건을 추출한다:
- `[MUST]`, `[SHOULD]`, `[MAY]` 태그가 붙은 항목을 파싱한다
- 체크리스트 항목(`- [ ]`, `- [x]`, `☐`, `☑`)도 파싱한다
- 각 항목에 `AC-001`, `AC-002` ... ID를 부여한다
- L2 하위 작업의 AC를 기본으로 하되, L1 Story의 AC도 통합한다

### 5. ticket.json 저장

`schemas/jira-ticket.schema.json` 구조에 맞춰 **L0(Epic)** 정보를 저장한다:

```
PROJECT_ROOT/.automation/tickets/{TICKET_KEY}/ticket.json
```

### 6. Task 생성 — L2 하위 작업 매핑

**각 L2(하위 작업) 티켓을 하나의 Task로 변환한다.**

#### 6-1. Story 컨텍스트 상속

L2 하위 작업의 Task를 생성할 때, 소속 L1 Story의 description에서 다음 섹션을 추출하여 Task에 상속한다:

| Story description 섹션 | Task 반영 위치 | 설명 |
|------------------------|---------------|------|
| Acceptance Criteria | `linked_ac_ids` | Story AC를 하위 Task들이 공유 |
| Policy Rules | `description`에 포함 | 해당 Task가 준수해야 할 정책 |
| API Spec | `description`에 포함 | 엔드포인트, 요청/응답 스펙 |
| Procedure / Implementation Steps | `description`에 포함 | 구현 절차 (단계별) |
| Entity Schemas | `description`에 포함 | 관련 엔티티 필드 정의 |
| State Machines | `description`에 포함 | 상태 전이 규칙 |
| Scenarios | `description`에 포함 | 테스트 시나리오 참조 |

하위 작업 자체의 description이 더 구체적이면 하위 작업 것을 우선한다. Story 컨텍스트는 하위 작업에 없는 정보를 보완하는 역할이다.

#### 6-2. Task 필드 매핑

conventions.json(`PROJECT_ROOT/.automation/conventions.json`)을 참조하여:
- `type`은 하위 작업의 `labels`(`impl`, `test`)과 `description`의 Entity/API/Batch Context를 분석하여 `task-meta.schema.json`의 `type` enum에서 선택
- `expected_files`는 conventions의 파일 네이밍 규칙 + description의 Entity/API Context에서 추론
- `dependencies`는 하위 작업의 `links[type=Blocks]`에서 추출 (DAG 구조, 순환 금지)
- `linked_ac_ids`는 하위 작업 AC + Story AC를 통합하여 연결
- `priority`는 Jira priority + 의존성 깊이를 고려

**Task ID 생성:**
- `openssl rand -hex 4`로 8자리 hex 생성 → `TASK-{hex}`

**Task 메타데이터에 Jira 출처 기록:**
- `metadata.jira_key`에 원본 하위 작업 키를 기록 (예: `GRID-79`)
- `metadata.story_key`에 소속 Story 키를 기록 (예: `GRID-21`)

### 7. Task 디렉토리 구조 생성

각 Task마다 다음 구조를 생성한다:

```
PROJECT_ROOT/.automation/tasks/{TASK_ID}/
├── meta/
│   └── task.json          ← task-meta.schema.json 준수
├── state/
│   └── status.json        ← task-status.schema.json 준수 (초기: PENDING)
└── artifacts/
    └── artifacts.json     ← 빈 배열로 초기화
```

**status.json 초기값:**
```json
{
  "task_id": "TASK-xxxxxxxx",
  "status": "PENDING",
  "retry_count": 0,
  "max_retries": 3,
  "updated_at": "..."
}
```

**artifacts.json 초기값:**
```json
{
  "task_id": "TASK-xxxxxxxx",
  "files": []
}
```

### 8. 의존성 그래프 생성

`schemas/dependency-graph.schema.json` 구조에 맞춰 DAG를 생성한다:

```
PROJECT_ROOT/.automation/tickets/{TICKET_KEY}/dependency-graph.json
```

- `nodes`: 각 Task의 `task_id`, `in_degree`, `out_degree`
- `edges`: Jira `links[type=Blocks]` 관계를 Task ID로 변환 + `reason` (한 줄 설명)
- **DAG 검증**: 순환이 있으면 에러를 출력하고 의존성을 조정한다
- **Story 간 의존성**: Story의 `links[type=Blocks]`는 하위 Task 그룹 간 의존성으로 전파한다

### 9. 검증 + 증거 생성

산출물 생성 후 post-analyze Hook(`hooks/post-step/post-analyze.sh`)을 실행한다:

1. 모든 `tasks/*/meta/task.json`을 `task-meta` 스키마로 검증
2. `tickets/{KEY}/ticket.json`을 `jira-ticket` 스키마로 검증
3. `tickets/{KEY}/dependency-graph.json`을 `dependency-graph` 스키마로 검증
4. `.automation/evidence/analyze.validated.json` 생성

### 10. 결과 출력

1. 티켓 요약 (key, summary, type, status)
2. 계층 트리 시각화 (Epic → Story → Subtask/Task 매핑)
3. 추출된 AC 목록
4. 분해된 Task 목록 (ID, type, title, jira_key, dependencies)
5. 의존성 그래프 시각화 (텍스트 기반 DAG)
6. 스키마 검증 결과

## 분해 예시

**티켓**: `GRID-2 — Core 엔티티 + 적립 API`

```
GRID-2 (Epic)
├── GRID-21 (Story: 데이터 모델 설계)
│   ├── GRID-79 → TASK-a1b2c3d4  backend:entity      Core 엔티티 생성
│   ├── GRID-80 → TASK-e5f6a7b8  backend:entity      Support 엔티티 생성
│   ├── GRID-81 → TASK-c9d0e1f2  backend:migration   DB 마이그레이션 + 인덱스
│   └── GRID-82 → TASK-a3b4c5d6  test:integration    Entity CRUD 검증
├── GRID-7 (Story: 적립금 지급 API)
│   ├── GRID-25 → TASK-e7f8a9b0  backend:service     적립금 계산 로직
│   ├── GRID-26 → TASK-c1d2e3f4  backend:service     Grant 생성 + 전환 로직
│   ├── GRID-27 → TASK-a5b6c7d8  backend:validation  idempotency_key 검증
│   ├── GRID-28 → TASK-f1a2b3c4  test:unit           적립 서비스 단위 테스트
│   ├── GRID-29 → TASK-d5e6f7a8  test:integration    적립 API E2E
│   └── GRID-30 → TASK-b9c0d1e2  test:unit           Edge Case 테스트
```

의존성 (Jira Blocks 관계에서 추출):
```
GRID-80 → GRID-79 → GRID-81 → GRID-82
                                   ↑
GRID-25 → GRID-26 → GRID-27       |
                         ↓         |
                    GRID-28,29,30 ─┘
```
