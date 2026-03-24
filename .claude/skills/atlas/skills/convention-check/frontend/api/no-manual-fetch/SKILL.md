---
name: no-manual-fetch
description: >
  수동 fetch/axios 호출이 존재하지 않는지 검증한다. orval-only와 함께 사용.
  Use this skill when: 모든 프론트엔드 파일이 생성되거나 수정될 때.
---

# no-manual-fetch — 수동 API 호출 금지 검증

## 검증 대상
모든 `*.tsx`, `*.ts` 파일 (test 제외)

## 검증 규칙

1. `fetch(` 직접 호출 없음 (서버 컴포넌트 내부 제외)
2. `axios` import 없음
3. `ky` import 없음
4. `XMLHttpRequest` 없음

## 검증 방법

파일 내용에서 패턴 매칭:
- `/fetch\s*\(/` → FAIL (단, `'use server'` 파일이나 서버 컴포넌트는 예외)
- `/import.*axios/` → FAIL
- `/import.*ky/` → FAIL

## 자동 수정

경고 + Orval 훅 대체 안내.

## 증거 포맷

```json
{
  "id": "FE-007",
  "category": "frontend/api",
  "rule": "수동 fetch 금지",
  "status": "PASS|FAIL",
  "violations": []
}
```
