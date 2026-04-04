---
name: atlas
description: Jira 티켓 기반 코드 자동 생성 엔진. 확정된 티켓 JSON을 기준으로 Setup → Analyze → Execute 파이프라인을 오케스트레이션할 때 사용한다.
user-invocable: true
---

# Atlas v5 — 오케스트레이터

메인 세션이 경량 오케스트레이터로 동작한다.
각 세부 작업은 `context: fork` 스킬로 위임한다.
게이트 검증은 오케스트레이터가 직접 스크립트를 실행한다.

## 환경 설정

`.claude/skills/atlas/.env`에서 환경 변수를 설정한다.

```
CODEBASE_DIR=/Users/rio/Documents/code/github/ecommerce-template/ecommerce-ax
TICKETS_DIR=.harness/tickets
```

| 변수 | 설명 | 필수 |
|---|---|---|
| `CODEBASE_DIR` | 실제 코드 작업 디렉토리 (절대 경로) | 필수 |
| `TICKETS_DIR` | 티켓 JSON 디렉토리 (CODEBASE_DIR 기준 상대 경로) | 기본값 `.harness/tickets` |

**시작 전 필수**: `.env`의 `CODEBASE_DIR`이 비어있으면 오케스트레이터가 사용자에게 물어 설정한다.

## 하네스 원칙

- 게이트 판단에는 **스크립트가 생성한 증거만** 사용
- LLM 산출물은 **기록(log)** — 게이트 판정에 사용 금지
- 로그는 훅이 자동 기록 (`agents.jsonl`, `skills.jsonl`)
- Learn 단계는 생략한다. Analyze는 확정 티켓을 직접 읽는다.
- fork skill의 child agent 최종 응답은 `.claude/skills/atlas/schemas/*.schema.json`에 맞는 JSON만 사용한다.

## 실행

`/atlas $ARGUMENTS`

`$ARGUMENTS` 파싱:
- 첫 번째 인자: 티켓 키 (필수)
- `--force`: 기존 run_dir을 무시하고 새 파이프라인을 시작한다

예시:
- `/atlas GRID-2` — 기존 run이 있으면 이어서, 없으면 새로 시작
- `/atlas GRID-2 --force` — 항상 새 run 생성

### --force 동작

`--force` 옵션이 있으면:
1. 해당 티켓의 기존 run_dir을 탐색하지 않는다
2. 무조건 Setup부터 새로 시작한다 (새 run_dir + 새 타임스탬프)
3. 기존 브랜치가 있으면 그 위에서 작업한다 (브랜치는 삭제하지 않음)

### --force가 없을 때 (기본)

1. `.automation/runs/{TICKET_KEY}-*/phase-context.json`에서 가장 최근 run을 탐색한다
2. 존재하면 `current_phase`를 읽어서 중단된 지점부터 이어간다
3. 존재하지 않으면 새로 시작한다

### 파이프라인 시작 절차

1. `.env` 읽기 → `CODEBASE_DIR`이 비어있으면 사용자에게 질문하여 설정
2. `$ARGUMENTS`에서 티켓 키와 `--force` 파싱
3. `--force`가 아니면 `.automation/runs/` 에서 기존 run_dir 탐색 → 있으면 이어가기
4. 없거나 `--force`면 Setup부터 시작

### 파이프라인 흐름

```
1. Setup   — Agent(subagent_type: "atlas-setup", ...) 호출 (Gate 0)
2. Analyze — Agent(subagent_type: "atlas-analyze", ...) 1회 호출 — 에이전트가 내부에서 전체 Analyze 흐름 완결 (Gate A 포함)
3. Execute — 태스크마다 Agent(subagent_type: "atlas-execute", ...) 1회 호출 — 에이전트가 내부에서 해당 태스크 전체 완결 (Gate E 포함)
```

**핵심 원칙**: 각 단계(Analyze, Execute)는 서브에이전트 1회 호출로 완결된다.
오케스트레이터는 에이전트 반환 후 증거 파일을 읽어 PASS/FAIL을 확인한다.
마지막 assistant 메시지는 참고용이며 판정 근거가 아니다.

### 게이트 증거

| 단계 | Gate | 스크립트 | 증거 |
|------|------|---------|------|
| Setup | Gate 0 | setup-pipeline.sh | setup-summary.json |
| Analyze | Gate A | validate-tasks.sh | tasks-validation.json |
| Execute | Gate E-pre | convention-check.sh + validate.sh | convention-check.json, validate.json |
| Execute | Gate E-post | cross-validate.sh | cross-validation.json |

## 구조

```
.claude/
├── agents/
│   ├── atlas-analyze.md         # Analyze 스킬용 프로파일
│   └── atlas-execute.md         # Execute 스킬용 프로파일
└── skills/
    ├── atlas/                   # 오케스트레이터 + 공유 리소스
    │   ├── SKILL.md
    │   ├── .env                   # 환경 변수 (CODEBASE_DIR, TICKETS_DIR)
    │   ├── config/
    │   │   └── gate0-profiles.json
    │   └── scripts/
    ├── atlas-analyze-ticket-read/
    ├── atlas-analyze-task-design/
    ├── atlas-analyze-gate-a-fix/
    ├── atlas-implement-task/
    ├── atlas-select-conventions/
    └── atlas-fix-from-validate/
```

## Setup 단계

오케스트레이터가 `atlas-setup` 에이전트를 호출한다.

```
Agent(
  subagent_type: "atlas-setup",
  prompt: "TICKET_KEY={TICKET_KEY} TICKETS_DIR={TICKETS_DIR} CODEBASE_DIR={CODEBASE_DIR} PROJECT_DIR=."
)
```

에이전트에 전달하는 값:
- `TICKET_KEY`: 파싱된 티켓 키 (예: GRID-2)
- `TICKETS_DIR`: `.env`의 `TICKETS_DIR`
- `CODEBASE_DIR`: `.env`의 `CODEBASE_DIR`
- `PROJECT_DIR`: `.` (atlas-engine 루트) — `.automation/`, 증거 파일이 여기에 생성됨

Gate 0 PASS 시 `phase-context.json` 갱신 후 Analyze로 진행.

## Analyze 단계

오케스트레이터가 `atlas-analyze` 에이전트를 **1회** 호출한다.
에이전트 프로파일(`.claude/agents/atlas-analyze.md`)에 전체 플로우가 정의되어 있으므로, 오케스트레이터는 파라미터만 전달한다.

```
Agent(
  subagent_type: "atlas-analyze",
  prompt: "TICKET_KEY={TICKET_KEY} RUN_DIR={RUN_DIR} CODEBASE_DIR={CODEBASE_DIR} TICKETS_DIR={TICKETS_DIR} SCRIPTS_DIR={PROJECT_DIR}/.claude/skills/atlas/scripts"
)
```

오케스트레이터는 에이전트 반환 후 `{RUN_DIR}/evidence/analyze/tasks-validation.json`을 읽어 Gate A 판정을 확인한다.
Gate A PASS 시 `phase-context.json` 갱신 후 Execute로 진행.

## Execute 단계

오케스트레이터가 태스크를 의존성 순서로 순회한다.
각 태스크마다 `atlas-execute` 에이전트를 **1회** 호출한다.
에이전트 프로파일(`.claude/agents/atlas-execute.md`)에 전체 플로우가 정의되어 있으므로, 오케스트레이터는 파라미터만 전달한다.

```
Agent(
  subagent_type: "atlas-execute",
  prompt: "TASK_ID={TASK_ID} RUN_DIR={RUN_DIR} CODEBASE_DIR={CODEBASE_DIR} SCRIPTS_DIR={PROJECT_DIR}/.claude/skills/atlas/scripts"
)
```

오케스트레이터는 에이전트 반환 후 증거 파일을 읽어 결과를 확인한다.
다음 태스크로 진행하거나 파이프라인 완료를 판단한다.

### 오케스트레이터 판정 규칙

- Analyze PASS 기준: `{RUN_DIR}/evidence/analyze/tasks-validation.json`의 `status == "pass"`
- Execute E-pre PASS 기준: `{RUN_DIR}/evidence/{TASK_ID}/convention-check.json`과 `validate.json`의 `status == "pass"`
- Execute E-post PASS 기준: `{RUN_DIR}/evidence/{TASK_ID}/cross-validation.json`의 `status == "pass"`
- 에이전트의 `last_message`만 보고 다음 단계로 진행하지 않는다.
