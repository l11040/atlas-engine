---
name: atlas-analyze
description: Atlas Analyze 단계 에이전트. 확정된 티켓 JSON을 태스크 단위로 분해하고 Gate A 검증을 통과할 수 있는 task-{id}.json 묶음을 준비한다.
tools: Bash, Read, Glob, Grep
---

# Analyze Agent

Learn 단계는 생략한다.
이 에이전트는 Setup에서 확정된 티켓 JSON을 직접 처리하지 않는다.
대신 fork 서브에이전트를 순차 호출하고, 각 서브에이전트가 전용 스킬 하나만 사용하게 한다.

## 수행 순서

### 1. 컨텍스트 확인

- `phase-context.json`에서 `run_dir`와 현재 상태를 확인한다.
- 이전 Analyze 실패가 있었다면 `ralp_state.last_gate_feedback`를 우선 반영한다.

### 2. fork 1: 티켓 해석

첫 번째 fork 서브에이전트는 `atlas-analyze-ticket-read` 스킬을 사용한다.

- 입력: `run_dir/tickets/*.json`
- 출력: 티켓별 구현 후보, AC 목록, 구조적 데이터 추출 결과
- 역할: 티켓을 읽고 구현 후보를 구조화한다.

### 3. fork 2: 태스크 설계

두 번째 fork 서브에이전트는 `atlas-analyze-task-design` 스킬을 사용한다.

- 입력: ticket-read 결과
- 출력: `tasks/task-{id}.json`
- 역할: 구현 후보를 실행 가능한 태스크로 쪼개고 `files[]`, `depends_on[]`, `deliverable`을 확정한다.

### 4. Gate A 검증

메인 Analyze 에이전트가 `validate-tasks.sh`를 실행해 `evidence/analyze/tasks-validation.json`을 생성한다.

- Gate A는 A-1 schema, A-2 scope, A-3 dependency, A-4 coverage 4개 서브게이트를 모두 PASS해야 한다.
- FAIL이면 세 번째 fork 서브에이전트를 호출한다.
- 최대 재시도는 3회다.

### 5. fork 3: Gate A 수정 루프

세 번째 fork 서브에이전트는 `atlas-analyze-gate-a-fix` 스킬을 사용한다.

- 입력: `tasks-validation.json`의 FAIL 내용, 기존 `task-{id}.json`
- 출력: 수정된 `task-{id}.json`
- 역할: schema, scope, dependency, coverage 오류를 수정하고 재검증 가능한 상태로 되돌린다.

### 6. 결과 보고

오케스트레이터에게 보고:

- 생성한 태스크 수
- Gate A 결과
- 어떤 fork 스킬이 어떤 산출물을 만들었는지
- 다음 단계에서 사용할 현재 태스크 후보
