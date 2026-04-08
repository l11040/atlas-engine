---
name: atlas-analyze-task-design
description: Atlas Analyze의 두 번째 세부 스킬. 티켓 해석 결과를 실행 가능한 task-{id}.json 묶음으로 설계해야 할 때 사용한다.
context: fork
agent: atlas-analyze
user-invocable: false
---

# Atlas Analyze Task Design

이 스킬은 ticket-read 결과를 바탕으로 실제 태스크 정의를 만든다.

## 입력

- `atlas-analyze-ticket-read` 결과 (`global_constraints` 포함) — `{RUN_DIR}/evidence/analyze/ticket-read.json`
- `run_dir/tickets/*.json` — 처리 대상 리프 티켓 전체

## 출력

- `run_dir/tasks/task-{id}.json`

## 핵심 원칙: 티켓 ≠ 태스크

**태스크는 티켓과 1:1로 매핑하지 않는다.**
티켓은 요구사항의 단위이고, 태스크는 구현의 단위다. 이 둘은 다르다.

- 큰 티켓(엔티티 여러 개, API 여러 개)은 **분리**한다.
- 밀접하게 결합된 작은 티켓들은 **병합**한다.
- 태스크 경계의 기준은 **하나의 코드 변경을 리뷰할 수 있는 응집 단위**다.

### 분리 기준
- 서로 다른 레이어(엔티티 / 서비스 / API / 배치)는 분리한다.
- 하나의 티켓이 3개 이상 독립적 파일 그룹을 포함하면 분리를 검토한다.
- 테스트는 대상 구현 태스크와 동일 태스크에 넣지 않는다.

### 병합 기준
- 동일 서비스의 연속적 로직(계산 → 상태전이 → 멱등성 등)은 하나의 태스크로 묶을 수 있다.
- 동일 도메인의 유사 테스트 티켓은 하나의 테스트 태스크로 묶을 수 있다.

### source_tickets
- 하나의 태스크는 `source_tickets[]`에 **여러 티켓 키**를 포함할 수 있다.
- 하나의 티켓 키가 **여러 태스크**의 `source_tickets`에 나타날 수 있다.

## 규칙

- 한 태스크는 하나의 응집된 구현 단위를 가진다.
- **`global_constraints`를 반드시 먼저 확인한다.** ticket-read가 에픽·스토리에서 추출한 전역 제약(모듈 배치, MUST_NOT 등)은 모든 태스크의 `files[]` 경로 설계에 우선 적용된다. 서브태스크 AC와 충돌 시 상위 제약이 우선한다.
- `files[]`는 티켓의 구조적 데이터와 전역 제약에서 유도 가능한 경로만 포함한다.
- `depends_on[]`는 실제 선행 작업만 포함한다.
- 모든 acceptance criteria는 최소 1개 태스크에 연결한다.
- 필수 인자(`TICKET_KEY`, `RUN_DIR`, `CODEBASE_DIR`)가 비어 있으면 스킬 설명 요약으로 대체하지 말고 인자 누락 오류를 반환한다.
- **`required_classes` 커버리지 보장**: 태스크 설계 완료 후 `ticket-read.json`의 `required_classes[]` 각 항목이 어느 태스크의 `files[]`에도 없으면 설계 오류다. 누락된 클래스는 가장 적합한 태스크의 `files[]`에 추가한 뒤 태스크 파일을 재저장한다. "가장 적합한 태스크"는 같은 모듈(FO/BO/batch) + 같은 레이어(service/controller/config)로 판단한다.
- **`joint_requirements` 처리**: `ticket-read.json`의 `joint_requirements[]` 각 항목의 `classes[]`는 동일 태스크 또는 직접 의존 관계의 태스크에 배치해야 한다. 서로 의존성 없는 독립 태스크로 분리하면 안 된다. joint_requirement의 classes가 서로 다른 독립 태스크에 분산되어 있으면 하나로 합치거나 의존성을 추가한다.

## 최소 포함 필드

- `task_id`
- `title`
- `source_tickets`
- `acceptance_criteria`
- `files`
- `depends_on`
- `deliverable`

## 반환 형식

반드시 아래 마크다운 형식으로 반환한다. JSON 객체, 코드펜스 감싼 JSON, 자유 설명 텍스트는 반환하지 않는다.

```
## 스킬 결과

- **스킬**: atlas-analyze-task-design
- **상태**: ok | error
- **티켓**: {TICKET_KEY}
- **제목**: {n}개 태스크 설계 완료

## 요약

{분리/병합 결정 근거, 태스크 경계 설정 논리 서술.}

## 설계된 태스크

| 태스크 | 제목 | 소스 티켓 | 의존성 |
|---|---|---|---|
| TASK-01 | Core 엔티티 구현 | GRID-79 | — |
| TASK-02 | Support 엔티티 구현 | GRID-79 | TASK-01 |

## AC 커버리지

| 티켓 | AC | 매핑된 태스크 |
|---|---|---|
| GRID-79 | PointAccount @Version 포함 | TASK-01 |

## required_classes 커버리지

| 클래스명 | 배치된 태스크 | files[] 경로 |
|---|---|---|
| FoPointGrantController | TASK-04 | server/fo/.../FoPointGrantController.java |
| BoPointGrantController | TASK-05 | server/bo/.../BoPointGrantController.java |
```

규칙:
- `task-{id}.json` 생성 후 이 형식으로 반환한다.
- `## AC 커버리지`는 모든 티켓의 모든 AC가 최소 1개 태스크에 매핑됐음을 확인하는 목적이다.
- `## required_classes 커버리지`는 `ticket-read.json`의 `required_classes[]` 모든 항목이 어느 태스크에 배치됐는지 확인하는 목적이다. required_classes가 없으면 섹션을 생략한다.

## 마지막 단계 (필수)

모든 작업 완료 후 반드시 아래 순서로 실행한다:

1. 위 마크다운 결과를 `{RUN_DIR}/skill-results/task-design.md`에 **Write** 한다.
2. 아무 설명 없이 `## 스킬 결과` 로 시작하는 마크다운만 출력한다.

파일 Write는 텍스트 출력보다 먼저 실행한다.
