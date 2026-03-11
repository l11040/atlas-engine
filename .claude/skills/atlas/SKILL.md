---
name: atlas
description: >
  Jira 티켓을 분석하여 프로젝트 컨벤션에 맞는 코드를 자동 생성하는 5단계 파이프라인.
  learn으로 컨벤션을 학습하고, analyze로 티켓을 Task로 분해하며, plan으로 실행 계획을 수립하고,
  execute로 코드를 생성한다. 티켓 기반 자동화, 컨벤션 학습, 코드 생성, Task 분해가 필요할 때 사용.
user-invocable: true
argument-hint: "TICKET-KEY|learn|analyze|plan|execute|complete [options]"
---

# Atlas

Jira 티켓 → 코드 자동 생성 파이프라인: `/learn → /analyze → /plan → /execute → /complete`

## 서브커맨드 라우팅

현재 요청: `$ARGUMENTS`

### 라우팅 규칙

`$0`(첫 번째 인자)을 분석하여 실행 모드를 결정한다:

1. **티켓 키 = 전체 파이프라인** — `$0`이 Jira 티켓 키 패턴(`[A-Z]+-\d+`, 예: `GRID-2`)과 일치하면 **전체 파이프라인 모드**로 진입한다. 이것이 기본이자 주요 사용 방식이다.
2. **명시적 서브커맨드** — `$0`이 아래 테이블의 서브커맨드와 일치하면 해당 스킬만 단독 실행한다.

### 전체 파이프라인 모드

티켓 키가 입력되면, **처음부터 끝까지** 아래 순서로 모든 스텝을 순차 실행한다:

| 순서 | 스텝 | 스킬 파일 | 증거 파일 | 인자 |
|------|------|-----------|-----------|------|
| 1 | learn | `skills/learn/learn.md` | `evidence/learn.validated.json` | 없음 |
| 2 | analyze | `skills/analyze/analyze.md` | `evidence/analyze.validated.json` | 티켓 키 |
| 3 | plan | `skills/plan/plan.md` | `evidence/plan.validated.json` | 티켓 키 |
| 4 | execute | `skills/execute/execute.md` | `evidence/execute.validated.json` | 티켓 키 |
| 5 | complete | `skills/complete/complete.md` | `evidence/complete.validated.json` | 티켓 키 |

**실행 규칙:**
- 각 스텝의 증거 파일(`status=validated`)이 이미 존재하면 해당 스텝을 **스킵**하고 다음으로 넘어간다.
- 증거가 없으면 해당 스킬 파일을 읽고 지시를 따라 실행한다.
- 스킬 파일(`skills/<step>/<step>.md`)이 아직 존재하지 않는 스텝은 스킵하고 "스킬 미구현" 메시지를 출력한 뒤 파이프라인을 종료한다.
- 각 스텝은 post-step Hook으로 증거를 생성한 뒤 다음 스텝으로 넘어간다.
- 스텝 실패 시 에러를 출력하고 파이프라인을 중단한다. 다음 실행 시 실패한 스텝부터 재개된다(이전 증거는 유지).

### 서브커맨드 테이블

| 서브커맨드 | 스킬 파일                     | 설명                                         |
| ---------- | ----------------------------- | -------------------------------------------- |
| `learn`    | `skills/learn/learn.md`       | 프로젝트 컨벤션 분석 → conventions.json 생성 |
| `analyze`  | `skills/analyze/analyze.md`   | Jira 티켓 재귀 수집 → L2(하위작업) = Task 1:1 매핑 |

옵션(`$1` 이후)은 각 스킬 파일의 지시에 따라 처리한다.
모든 상대 경로는 이 SKILL.md가 위치한 디렉토리(`${CLAUDE_SKILL_DIR}`) 기준이다.

## 실행 규칙

1. **스킬 파일을 먼저 읽는다**: 서브커맨드에 해당하는 스킬 파일(`skills/<subcmd>/`)을 읽고 그 지시를 따른다.
2. **스키마를 따른다**: 산출물 생성 시 `schemas/` 하위의 해당 스키마를 읽어서 구조를 확인한다.
3. **증거를 남긴다**: 스텝 완료 후 post-step Hook 스크립트를 Bash로 실행하여 산출물을 스키마 검증하고 `.automation/evidence/{step}.validated.json`을 생성한다.
4. **다음 스텝은 증거만 확인한다**: 스텝 시작 전 pre-step Hook 스크립트를 실행하여 이전 스텝의 증거 파일 존재 + `status=validated`를 확인한다.

## 환경 설정

스킬 루트의 `.env`(`${CLAUDE_SKILL_DIR}/.env`)를 직접 읽는다. 파일이 없으면 에러를 출력하고 종료한다.

## /analyze 산출물 구조

```
PROJECT_ROOT/.automation/
├── tickets/{TICKET_KEY}/
│   ├── source.json              ← fetch-ticket.py 출력 (hierarchy + 전체 티켓)
│   ├── ticket.json              ← jira-ticket 스키마 준수 (Epic 정보)
│   └── dependency-graph.json    ← DAG (Task 간 의존성)
├── tasks/TASK-{hex}/
│   ├── meta/task.json           ← task-meta 스키마 (L2 하위작업 1:1 매핑)
│   ├── state/status.json        ← task-status 스키마 (초기: PENDING)
│   └── artifacts/artifacts.json ← 빈 배열로 초기화
└── evidence/analyze.validated.json
```

### Jira 계층 → Task 매핑

| Jira 레벨 | issuetype | 역할 | Task 생성 |
|-----------|-----------|------|-----------|
| L0 | 에픽 | 요구사항 전체 범위 → ticket.json | X |
| L1 | 스토리 | 기능 단위 그룹핑 → Task 그룹 컨텍스트 | X |
| L2 | 하위 작업 | 실제 코드 작업 단위 → **Task 1:1 매핑** | O |

## Python 의존성

`/analyze`의 `fetch-ticket.py` 스크립트에 필요한 패키지:

```bash
pip3 install requests python-dotenv
```

## 참조 문서

- [Hook 아키텍처](references/hook-architecture.md) — post-step/pre-step Hook 구조
- [컨벤션 레이어](references/convention-layers.md) — Layer 0~4 우선순위 규칙
