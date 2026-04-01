---
name: atlas-implement-task
context: fork
description: Atlas Execute의 첫 번째 하위 스킬. task-{id}.json 기준으로 코드를 생성/수정한다.
---

# Atlas Implement Task

현재 태스크의 코드를 생성/수정하는 구현 스킬.

## 입력

- `task-{id}.json` — 태스크 정의
- `source.json` 또는 `tickets/*.json` — 원본 티켓 상세 스펙
- 타겟 프로젝트 코드베이스 — 기존 컨벤션 참조

## 수행

1. `task-{id}.json`의 `files[]`와 `acceptance_criteria`를 읽는다.
2. `source_tickets`에 명시된 원본 티켓을 읽어 상세 스펙을 확인한다.
3. 타겟 프로젝트의 기존 코드를 읽어 컨벤션을 파악한다.
   - 같은 레이어(엔티티/서비스/배치 등)의 기존 파일을 최소 1개 참조한다.
   - BaseEntity, Repository 패턴, Enum 패턴, 서비스 패턴을 따른다.
4. `files[]`에 명시된 파일을 생성하거나 수정한다.
5. `acceptance_criteria`의 모든 항목을 코드에 반영한다.
6. DDL과 엔티티 `@Column(name)`이 일치하는지 확인한다.

## 규칙

- `files[]` 범위 밖의 파일은 수정하지 않는다. 단, 필수 에러 코드 추가 등 최소한의 변경은 허용.
- 서비스에서 도메인 로직을 하드코딩하지 않는다. 엔티티 도메인 메서드를 사용한다.
- DomainException으로 예외를 통일한다.
- 테스트는 JUnit 5 + Mockito (단위) 또는 @DataJpaTest (통합)를 사용한다.

## 출력

- 생성/수정된 파일 목록
- 각 AC별 충족 여부 체크리스트
