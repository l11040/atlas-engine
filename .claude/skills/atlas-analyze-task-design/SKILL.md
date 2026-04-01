---
name: atlas-analyze-task-design
context: fork
description: Atlas Analyze의 두 번째 세부 스킬. 티켓 해석 결과를 실행 가능한 task-{id}.json 묶음으로 설계해야 할 때 사용한다.
---

# Atlas Analyze Task Design

이 스킬은 ticket-read 결과를 바탕으로 실제 태스크 정의를 만든다.

## 입력

- `atlas-analyze-ticket-read` 결과
- `run_dir/tickets/*.json`

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
- `files[]`는 티켓의 구조적 데이터에서 유도 가능한 경로만 포함한다.
- `depends_on[]`는 실제 선행 작업만 포함한다.
- 모든 acceptance criteria는 최소 1개 태스크에 연결한다.

## 최소 포함 필드

- `task_id`
- `title`
- `source_tickets`
- `acceptance_criteria`
- `files`
- `depends_on`
- `deliverable`
