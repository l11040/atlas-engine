---
name: atlas-analyze-gate-a-fix
description: Atlas Analyze의 세 번째 세부 스킬. Gate A 검증 결과를 읽어 PASS면 no-op로 기록하고, FAIL이면 tasks-validation.json 피드백을 반영해 task-{id}.json을 수정한다.
context: fork
agent: atlas-analyze
user-invocable: false
---

# Atlas Analyze Gate A Fix

이 스킬은 Analyze 단계에서 항상 호출될 수 있다.
- Gate A가 PASS이면 no-op로 종료하고 PASS 근거를 로그에 남긴다.
- Gate A가 FAIL이면 기존 태스크 정의를 버리지 않고, 검증 실패 원인을 수정해 재검증 가능한 상태로 만든다.

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
- `tasks-validation.json.status == "pass"`이면 파일을 수정하지 않고 no-op 결과를 반환한다.
- `tasks-validation.json.status == "fail"`이면 필요한 항목만 최소 수정한다.
- 수정 근거는 `tasks-validation.json`의 오류 내용만 사용한다.
- 재검증은 오케스트레이터가 수행한다.
- `RUN_DIR` 또는 검증 입력이 없으면 스킬 프로파일 설명으로 우회하지 말고, 필수 인자 누락 오류로 종료한다.

## 반환 형식

반드시 아래 마크다운 형식으로 반환한다. JSON 객체, 코드펜스 감싼 JSON, 자유 설명 텍스트는 반환하지 않는다.

**Gate A PASS (no-op):**
```
## 스킬 결과

- **스킬**: atlas-analyze-gate-a-fix
- **상태**: noop
- **액션**: noop
- **제목**: Gate A PASS — 수정 없음

## 요약

Gate A 검증이 PASS 상태다. tasks-validation.json의 모든 서브게이트(A1~A4)가 통과했으므로 태스크 파일을 수정하지 않는다.
```

**Gate A FAIL (수정 후):**
```
## 스킬 결과

- **스킬**: atlas-analyze-gate-a-fix
- **상태**: ok
- **액션**: patched
- **제목**: Gate A FAIL 수정 완료

## 요약

{어떤 검증이 실패했고 어떤 수정을 했는지 서술.}

## 수정 내역

| 태스크 | 수정 항목 | 원인 | 조치 |
|---|---|---|---|
| TASK-02 | files[] 경로 오류 | A2_scope: 허용 경로 외 파일 | 경로 수정 |
```

규칙:
- `**액션**` 값: `noop` (PASS, 수정 없음) / `patched` (FAIL, 수정 완료)
- `## 수정 내역` 섹션은 `액션: patched`일 때만 포함한다.

## 마지막 단계 (필수)

모든 작업 완료 후 반드시 아래 순서로 실행한다 (PASS no-op 포함):

1. 위 마크다운 결과를 `{RUN_DIR}/skill-results/gate-a-fix.md`에 **Write** 한다.
2. 아무 설명 없이 `## 스킬 결과` 로 시작하는 마크다운만 출력한다.

파일 Write는 텍스트 출력보다 먼저 실행한다.
