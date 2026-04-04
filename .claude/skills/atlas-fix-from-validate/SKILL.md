---
name: atlas-fix-from-validate
description: Atlas Execute의 Gate 기록/수정 스킬. Gate E-pre 또는 Gate E-post 직후 항상 호출되며, 호출자가 전달한 GATE_STATUS에 따라 PASS면 noop을 기록하고 FAIL이면 필요한 수정만 수행한다.
context: fork
agent: atlas-execute
user-invocable: false
---

# Atlas Fix From Validate

Gate E-pre (`convention-check.sh` + `validate.sh`) 또는 Gate E-post (`cross-validate.sh`) 직후 **항상 호출**된다.
호출자는 `GATE_STATUS=pass|fail`을 함께 전달하며, 스킬은 이 값을 기준으로 noop 또는 수정 경로를 결정한다.

## 입력

- `GATE` 인자 — `E-pre` 또는 `E-post`
- `GATE_STATUS` 인자 — `pass` 또는 `fail`
- `convention-check.json` — E-pre 컨벤션 검증 결과
- `validate.json` — E-pre 빌드/린트/스코프 검증 결과
- `cross-validation.json` — E-post 교차 검증 결과
- `task-{id}.json` — 현재 태스크 정의
- 이전 수정 이력 (`failure-history.json` 존재 시)

## 수행

1. `GATE`와 `GATE_STATUS` 값을 읽는다.
2. `GATE_STATUS=pass`이면 → **noop**. Gate 증거 파일 존재만 확인하고 수정 없이 마지막 단계로 이동한다.
3. `GATE_STATUS=fail`이면 Gate 종류에 따라 증거 파일을 읽는다.
   - `GATE=E-pre`이면 `convention-check.json`과 `validate.json`에서 FAIL 항목을 추출한다.
   - `GATE=E-post`이면 `cross-validation.json`에서 `violations`를 추출한다.
4. 각 FAIL 항목의 원인을 분석한다.
5. 해당 파일을 수정한다.
6. 수정 내역을 `failure-history.json`에 기록한다.

## 규칙

- 동일한 오류를 같은 방법으로 3회 이상 수정하지 않는다. 다른 접근을 시도한다.
- `files[]` 범위 밖의 파일은 수정하지 않는다.
- 단, `cross-validation.json`이 요구하는 지원 파일(`build.gradle`, `application-*.yml`)은 현재 태스크 커밋에 실제 포함됐다면 `task-{id}.json`의 `files[]`에 반영할 수 있다.
- 수정 시 다른 AC를 깨뜨리지 않도록 주의한다.
- `atlas-analyze-gate-a-fix` 역할을 대신하지 않는다.
- 호출 여부를 결정하지 않는다. 이 스킬은 항상 호출된다는 전제이며, `GATE_STATUS`에 따라 noop 또는 수정만 결정한다.

## 출력

- 수정된 파일 목록
- `failure-history.json` 갱신

## 반환 형식

반드시 아래 마크다운 형식으로 반환한다. JSON 객체, 코드펜스 감싼 JSON, 자유 설명 텍스트는 반환하지 않는다.

**Gate PASS (noop):**
```
## 스킬 결과

- **스킬**: atlas-fix-from-validate
- **상태**: noop
- **게이트**: E-pre | E-post
- **태스크**: {TASK_ID}
- **제목**: {TASK_ID} {E-pre|E-post} PASS — 수정 없음

## 요약

Gate {E-pre|E-post} 검증이 PASS 상태다. 수정 없이 로그만 기록한다.
```

**Gate FAIL (수정 후):**
```
## 스킬 결과

- **스킬**: atlas-fix-from-validate
- **상태**: ok | error
- **게이트**: E-pre | E-post
- **태스크**: {TASK_ID}
- **제목**: {TASK_ID} {E-pre|E-post} 수정 완료

## 요약

{어떤 검증이 실패했고, 어떤 판단으로 어떻게 수정했는지 서술.}

## 수정 파일

- `경로/파일.java`

## 실패 원인 및 조치

| 항목 | 원인 | 조치 |
|---|---|---|
| entity-naming | 클래스명 snake_case 사용 | PascalCase로 변경 |
```

규칙:
- `**게이트**` 값: `E-pre` 또는 `E-post`
- Gate PASS이면 `- **상태**: noop`으로 반환하고 수정 섹션은 포함하지 않는다.
- `## 수정 파일`은 실제 변경된 파일만 포함한다.

## 마지막 단계 (필수)

모든 수정 작업 완료 후 반드시 아래 순서로 실행한다:

1. 현재 재시도 횟수 N을 확인한다 (첫 호출=1, 이후 누적).
2. 위 마크다운 결과를 `{RUN_DIR}/skill-results/{TASK_ID}/fix-from-validate-{GATE}-{N}.md`에 **Write** 한다.
3. 아무 설명 없이 `## 스킬 결과` 로 시작하는 마크다운만 출력한다.

파일 Write는 텍스트 출력보다 먼저 실행한다.
