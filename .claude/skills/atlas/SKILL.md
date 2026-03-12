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

| 순서 | 스텝 | 스킬 파일 | 증거 파일 위치 | 인자 |
|------|------|-----------|----------------|------|
| 1 | learn | `skills/learn/SKILL.md` | `.automation/evidence/learn.validated.json` (공유) | 없음 |
| 2 | analyze | `skills/analyze/SKILL.md` | `${RUN_DIR}/evidence/analyze.validated.json` | 티켓 키 |
| 3 | plan | `skills/plan/SKILL.md` | `${RUN_DIR}/evidence/plan.validated.json` | 티켓 키 |
| 4 | execute | `skills/execute/SKILL.md` | `${RUN_DIR}/evidence/execute.validated.json` | 티켓 키 |
| 5 | complete | `skills/complete/SKILL.md` | `${RUN_DIR}/evidence/complete.validated.json` | 티켓 키 |

**실행 규칙:**
- 각 스텝의 증거 파일(`status=validated`)이 이미 존재하면 해당 스텝을 **스킵**하고 다음으로 넘어간다.
- **learn 스킵 시 참조 증거 생성:** learn은 프로젝트 공유 증거(`.automation/evidence/learn.validated.json`)를 확인하여 스킵하지만, 이 run에서도 확인 기록을 남겨야 한다. 공유 증거를 읽어 `${RUN_DIR}/evidence/learn.referenced.json`을 생성한다:
  ```json
  {
    "step": "learn",
    "status": "referenced",
    "referenced_at": "ISO-8601",
    "source": ".automation/evidence/learn.validated.json",
    "source_validated_at": "(공유 증거의 validated_at 값)"
  }
  ```
- 증거가 없으면 해당 스킬 파일을 읽고 지시를 따라 실행한다.
- 스킬 파일(`skills/<step>/SKILL.md`)이 아직 존재하지 않는 스텝은 스킵하고 "스킬 미구현" 메시지를 출력한 뒤 파이프라인을 종료한다.
- 각 스텝은 post-step Hook으로 증거를 생성한 뒤 다음 스텝으로 넘어간다.
- 스텝 실패 시 에러를 출력하고 파이프라인을 중단한다. 다음 실행 시 실패한 스텝부터 재개된다(이전 증거는 유지).
- **모든 Hook과 스크립트 호출 시 `RUN_DIR` 환경변수를 전달한다.**

### Run 관리

파이프라인은 **run** 단위로 격리된다. run = `.automation/runs/{TICKET_KEY}-{hash8}/`

**Run 결정 로직 (파이프라인 시작 시):**
1. `.automation/runs.json`에서 `active_runs[TICKET_KEY]`를 조회한다.
2. 활성 run이 있고 `--force`가 없으면 → 기존 run 이어서 진행.
3. 활성 run이 없거나 `--force`이면 → `common.sh`의 `create_run()`으로 새 run 생성.
4. `RUN_DIR`을 해당 run의 절대 경로로 설정한다.

```bash
# 예시: Run 결정
source scripts/common.sh && load_env
RUN_ID=$(resolve_run "GRID-2")
if [ -z "$RUN_ID" ] || [ "$FORCE" = "true" ]; then
  RUN_ID=$(create_run "GRID-2")
fi
export RUN_DIR=$(run_dir_path "$RUN_ID")
```

### 서브커맨드 테이블

| 서브커맨드 | 스킬 파일                     | 설명                                         |
| ---------- | ----------------------------- | -------------------------------------------- |
| `learn`    | `skills/learn/SKILL.md`       | 프로젝트 컨벤션 분석 → conventions.json 생성 |
| `analyze`  | `skills/analyze/SKILL.md`     | Jira 티켓 재귀 수집 → L2(하위작업) = Task 1:1 매핑 |
| `plan`     | `skills/plan/SKILL.md`        | DAG 위상 정렬 → Wave 기반 실행 계획 생성     |

옵션(`$1` 이후)은 각 스킬 파일의 지시에 따라 처리한다.
모든 상대 경로는 이 SKILL.md가 위치한 디렉토리(`${CLAUDE_SKILL_DIR}`) 기준이다.

## 실행 규칙

1. **스킬 파일을 먼저 읽는다**: 서브커맨드에 해당하는 스킬 파일(`skills/<subcmd>/`)을 읽고 그 지시를 따른다.
2. **스키마를 따른다**: 산출물 생성 시 `schemas/` 하위의 해당 스키마를 읽어서 구조를 확인한다.
3. **증거를 남긴다**: 스텝 완료 후 post-step Hook 스크립트를 `RUN_DIR` 환경변수와 함께 Bash로 실행하여 산출물을 스키마 검증하고 `${RUN_DIR}/evidence/{step}.validated.json`을 생성한다.
4. **다음 스텝은 증거만 확인한다**: 스텝 시작 전 pre-step Hook 스크립트를 실행하여 이전 스텝의 증거 파일 존재 + `status=validated`를 확인한다.

## 환경 설정

스킬 루트의 `.env`(`${CLAUDE_SKILL_DIR}/.env`)를 직접 읽는다. 파일이 없으면 에러를 출력하고 종료한다.

## 산출물 구조

```
PROJECT_ROOT/.automation/
├── conventions.json                        ← 공유 (프로젝트 레벨, learn 산출물)
├── evidence/
│   └── learn.validated.json                ← 공유 (프로젝트 레벨)
├── runs.json                               ← 활성 run 추적 레지스트리
│
└── runs/{TICKET_KEY}-{hash8}/              ← run 격리 단위
    ├── source.json                         ← fetch-ticket.py 출력 (원본 보존)
    ├── tickets/                            ← 계층형 티켓 트리 (L0/L1/L2)
    │   └── {EPIC}/                         ← L0 Epic
    │       ├── ticket.json
    │       ├── {STORY}/                    ← L1 Story
    │       │   ├── ticket.json
    │       │   └── {SUBTASK}/              ← L2 Subtask
    │       │       └── ticket.json
    │       └── ...
    ├── dependency-graph.json               ← DAG (Task 간 의존성)
    ├── policy-registry.json                ← Story Policy 추적 레지스트리
    ├── execution-plan.json                 ← Wave 기반 실행 계획
    ├── evidence/                           ← 이 run의 스텝별 증거
    │   ├── learn.referenced.json          ← 공유 learn 증거 참조 기록
    │   ├── analyze.validated.json
    │   ├── plan.validated.json
    │   ├── execute.validated.json
    │   └── complete.validated.json
    └── tasks/TASK-{hex}/
        ├── meta/task.json                  ← task-meta 스키마 (AC 내장 + policy_refs)
        ├── state/status.json               ← task-status 스키마 (초기: PENDING)
        └── artifacts/artifacts.json        ← 빈 배열로 초기화
```

### 공유 vs 격리

| 항목 | 범위 | 위치 |
|------|------|------|
| conventions.json | **프로젝트 공유** | `.automation/conventions.json` |
| learn 증거 | **프로젝트 공유** | `.automation/evidence/learn.validated.json` |
| 티켓 데이터 / Task / 증거 | **run 격리** | `.automation/runs/{KEY}-{hash}/` |

### AC와 Policy 소유 범위

| 항목 | 소유 범위 | 저장 위치 | task.json 필드 |
|------|-----------|-----------|----------------|
| AC | Subtask(L2) 고유 | `task.json.acceptance_criteria` | `acceptance_criteria[]` |
| Policy | Story(L1) 공유 | `policy-registry.json` | `policy_refs[]` |

- AC는 각 Task에 내장. execute에서 자기 AC 충족 여부를 바로 판정
- Policy는 Story 레벨에서 수집. `implemented_by` / `tested_by`로 Task 역참조

**상태 전이:** `pending` → `in_progress` (execute) → `verified`/`failed` (complete)

### Jira 계층 → Task 매핑

| Jira 레벨 | issuetype | 역할 | Task 생성 |
|-----------|-----------|------|-----------|
| L0 | 에픽 | 요구사항 전체 범위 → `tickets/{EPIC}/ticket.json` | X |
| L1 | 스토리 | 기능 단위 그룹핑 + **Policy 소스** → `tickets/{EPIC}/{STORY}/ticket.json` | X |
| L2 | 하위 작업 | 실제 코드 작업 단위 → **Task 1:1 매핑** (AC 내장) → `tickets/{EPIC}/{STORY}/{SUBTASK}/ticket.json` | O |

### 티켓 트리 접근 (execute 단계)

execute에서 Task를 실행할 때, `task.json`의 `metadata.jira_key`와 `metadata.story_key`로 필요한 티켓만 읽는다:
```
tickets/{EPIC}/{story_key}/{jira_key}/ticket.json  ← L2 Subtask 상세
tickets/{EPIC}/{story_key}/ticket.json              ← L1 Story 컨텍스트
```

## Python 의존성

`/analyze`의 `fetch-ticket.py` 스크립트에 필요한 패키지:

```bash
pip3 install requests python-dotenv
```

## 참조 문서

- [Hook 아키텍처](references/hook-architecture.md) — post-step/pre-step Hook 구조
- [컨벤션 레이어](references/convention-layers.md) — Layer 0~4 우선순위 규칙
