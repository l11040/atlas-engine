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

- `run_dir/tickets/*.json`
- 필요 시 `phase-context.json`

## 출력

- 티켓별 acceptance criteria 목록
- 엔티티/API/배치/테스트 후보
- 구조적 데이터 추출 결과
  - `entity_tables`
  - `api_spec`
  - `key_value`

## 규칙

- 티켓에 실제로 적힌 정보만 사용한다.
- 자연어 추정으로 파일 경로나 의존성을 확정하지 않는다.
- 태스크 설계는 다음 스킬로 넘긴다.
- 필수 인자(`TICKET_KEY`, `RUN_DIR`, `CODEBASE_DIR`, `TICKETS_DIR`)가 비어 있으면 스킬 설명 요약으로 대체하지 말고 인자 누락 오류를 반환한다.

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
```

규칙:
- `ticket-read.json` 생성 후 이 형식으로 반환한다.
- 구조적 데이터에 해당 항목이 없으면 해당 줄을 생략한다.

## 마지막 단계 (필수)

모든 작업 완료 후 반드시 아래 순서로 실행한다:

1. 위 마크다운 결과를 `{RUN_DIR}/skill-results/ticket-read.md`에 **Write** 한다.
2. 아무 설명 없이 `## 스킬 결과` 로 시작하는 마크다운만 출력한다.

파일 Write는 텍스트 출력보다 먼저 실행한다.
