---
name: atlas-analyze-ticket-read
description: Atlas Analyze의 첫 번째 세부 스킬. 확정 티켓 JSON을 읽어 acceptance criteria, 구조적 데이터, 구현 후보를 추출해야 할 때 사용한다.
context: fork
agent: atlas-analyze
user-invocable: false
---

# Atlas Analyze Ticket Read

이 스킬은 Analyze 단계의 ticket-reading 전용이다.
티켓을 읽고 구현 후보를 구조화하되 아직 `task-{id}.json`을 확정하지 않는다.

## 입력

- `run_dir/context/epic.json` — 에픽 전체 범위·링크 (존재 시 반드시 먼저 읽는다)
- `run_dir/context/stories/*.json` — 스토리별 MUST/MUST_NOT AC (존재 시 반드시 읽는다)
- `run_dir/tickets/*.json` — 리프 서브태스크 티켓
- 필요 시 `phase-context.json`

## 출력

- 에픽·스토리에서 추출한 전역 제약 (MUST_NOT, 모듈 배치 규칙 등)
- 티켓별 acceptance criteria 목록
- 엔티티/API/배치/테스트 후보
- 구조적 데이터 추출 결과
  - `entity_tables`
  - `api_spec`
  - `key_value`
- `required_classes[]` — 티켓 원문에 명시된 구현 클래스명 목록 (서비스, 컨트롤러, 배치 클래스 등)
- `joint_requirements[]` — 동시 구현이 MUST인 클래스 묶음 (예: FO+BO 양쪽 엔드포인트 동시 구현)

## 규칙

- **처리 대상 범위는 `run_dir/tickets/*.json`의 파일 전체다.** epic.json과 stories/*.json의 `subtasks` 목록은 처리 범위 결정에 절대 사용하지 않는다. scope는 오직 tickets/ 디렉토리가 결정한다.
- **epic.json이 존재하면 반드시 가장 먼저 읽는다.** 에픽의 `description`에서 전체 기능 범위와 연관 스토리 목록을 파악한다.
- **stories/*.json이 존재하면 모두 읽는다.** 스토리의 `Acceptance Criteria` 중 MUST/MUST_NOT 항목을 전역 제약으로 추출한다. 특히 모듈 배치·파일 위치에 관한 MUST_NOT은 `global_constraints` 필드에 별도 기록한다.
- 리프 티켓(서브태스크)의 AC는 에픽·스토리 제약에 종속된다. 상위 제약과 충돌하는 서브태스크 해석은 상위 제약을 우선한다.
- 티켓에 실제로 적힌 정보만 사용한다.
- 자연어 추정으로 파일 경로나 의존성을 확정하지 않는다.
- 태스크 설계는 다음 스킬로 넘긴다.
- 필수 인자(`TICKET_KEY`, `RUN_DIR`, `CODEBASE_DIR`, `TICKETS_DIR`)가 비어 있으면 스킬 설명 요약으로 대체하지 말고 인자 누락 오류를 반환한다.
- **`required_classes` 추출**: 에픽·스토리·서브태스크 AC에 클래스명이 명시되어 있으면 (예: `FoPointGrantController`, `AdminManualGrantService`) `required_classes[]`에 등록한다. 추론이 아닌 원문에 실제로 등장한 클래스명만 등록한다.
- **`joint_requirements` 추출**: "both endpoints required", "FO+BO 동시 구현" 등 두 개 이상의 클래스를 반드시 함께 구현해야 한다는 동시성 제약은 `joint_requirements[]`로 별도 추출한다. 각 항목은 `{ "id", "ticket", "description", "classes": [] }` 형태로 기록한다.
- **`ticket-read.json` 작성**: `{RUN_DIR}/evidence/analyze/ticket-read.json`에 `required_classes`와 `joint_requirements`를 최상위 필드로 포함하여 저장한다. 이 파일은 Gate A 스크립트가 읽는 증거 파일이다.

## 반환 형식

반드시 아래 마크다운 형식으로 반환한다. JSON 객체, 코드펜스 감싼 JSON, 자유 설명 텍스트는 반환하지 않는다.

```
## 스킬 결과

- **스킬**: atlas-analyze-ticket-read
- **상태**: ok | error
- **티켓**: {TICKET_KEY}
- **제목**: {TICKET_KEY} 티켓 해석 완료 — {n}개 서브티켓

## 요약

{티켓 에픽의 전체 흐름, 주요 도메인 개념, 구현 후보 요약.}

## 티켓 목록

| 티켓 | 제목 | AC 수 | 구현 후보 |
|---|---|---|---|
| GRID-79 | Core 엔티티 구현 | 10 | 엔티티 4개, Repository 1개 |

## 구조적 데이터

**엔티티**: PointAccount, Grant, LedgerEntry, SpendHold
**API**: `POST /accounts/{id}/grants`, `GET /accounts/{id}`
**배치**: BAT-001
**테스트**: TST-EARN-001, TST-ADM-001

## required_classes

- `FoPointGrantController`
- `FoPointAccountController`
- `FoPointLedgerController`
- `BoPointGrantController`

## joint_requirements

| ID | 티켓 | 설명 | 클래스 |
|---|---|---|---|
| GRID-13-joint | GRID-13 | FO+BO 동시 구현 필수 | FoPointAccountController, BoPointAccountController |
```

규칙:
- `ticket-read.json` 생성 후 이 형식으로 반환한다.
- 구조적 데이터에 해당 항목이 없으면 해당 줄을 생략한다.
- `required_classes`, `joint_requirements`에 해당 항목이 없으면 해당 섹션을 생략한다.

## 마지막 단계 (필수)

모든 작업 완료 후 반드시 아래 순서로 실행한다:

1. 추출한 전체 결과를 `{RUN_DIR}/evidence/analyze/ticket-read.json`에 **Write** 한다.
   - 기존 필드(description, global_constraints 등) 외에 `required_classes` 배열과 `joint_requirements` 배열을 최상위 필드로 포함한다.
   - `required_classes` 형식: `["ClassName1", "ClassName2", ...]` (티켓 원문에 등장한 클래스명, 경로 없이 클래스명만)
   - `joint_requirements` 형식: `[{ "id": "...", "ticket": "...", "description": "...", "classes": ["A", "B"] }]`
2. 위 마크다운 결과를 `{RUN_DIR}/skill-results/ticket-read.md`에 **Write** 한다.
3. 아무 설명 없이 `## 스킬 결과` 로 시작하는 마크다운만 출력한다.

파일 Write는 텍스트 출력보다 먼저 실행한다.
