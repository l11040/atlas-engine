---
name: atlas-analyze-gate-a-fix
context: fork
description: Atlas Analyze의 세 번째 세부 스킬. Gate A 실패 후 tasks-validation.json 피드백을 반영해 task-{id}.json을 수정해야 할 때 사용한다.
---

# Atlas Analyze Gate A Fix

이 스킬은 Gate A 실패 시에만 호출한다.
기존 태스크 정의를 버리지 않고, 검증 실패 원인을 수정해 재검증 가능한 상태로 만든다.

## 입력

- `run_dir/evidence/analyze/tasks-validation.json`
- 기존 `run_dir/tasks/task-{id}.json`

## 수정 우선순위

1. schema 오류
2. scope 이탈 파일
3. dependency 오류
4. acceptance criteria 누락

## 규칙

- PASS/FAIL 판정은 하지 않는다.
- 수정 근거는 `tasks-validation.json`의 오류 내용만 사용한다.
- 필요한 항목만 최소 수정한다.
- 재검증은 상위 Analyze 에이전트가 수행한다.
