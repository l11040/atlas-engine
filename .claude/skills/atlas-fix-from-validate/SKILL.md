---
name: atlas-fix-from-validate
context: fork
description: Atlas Execute의 세 번째 하위 스킬. Gate E-pre 검증 실패 시 오류를 수정한다.
---

# Atlas Fix From Validate

Gate E-pre (`convention-check.sh` + `validate.sh`) 실패 시, 증거 파일의 오류 내용을 읽어 코드를 수정한다.

## 입력

- `convention-check.json` — 컨벤션 검증 결과 (FAIL 항목 포함)
- `validate.json` — 빌드/린트/스코프 검증 결과 (FAIL 항목 포함)
- `task-{id}.json` — 현재 태스크 정의
- 이전 수정 이력 (`failure-history.json` 존재 시)

## 수행

1. `convention-check.json`과 `validate.json`에서 FAIL 항목을 추출한다.
2. 각 FAIL 항목의 원인을 분석한다.
3. 해당 파일을 수정한다.
4. 수정 내역을 `failure-history.json`에 기록한다.

## 규칙

- 동일한 오류를 같은 방법으로 3회 이상 수정하지 않는다. 다른 접근을 시도한다.
- `files[]` 범위 밖의 파일은 수정하지 않는다.
- 수정 시 다른 AC를 깨뜨리지 않도록 주의한다.

## 출력

- 수정된 파일 목록
- `failure-history.json` 갱신
