---
name: atlas-analyze-ticket-read
context: fork
description: Atlas Analyze의 첫 번째 세부 스킬. 확정 티켓 JSON을 읽어 acceptance criteria, 구조적 데이터, 구현 후보를 추출해야 할 때 사용한다.
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

## 결과 형식

- 티켓별 요약
- AC 목록
- 구현 후보 목록
- 구조적 데이터 추출 목록
