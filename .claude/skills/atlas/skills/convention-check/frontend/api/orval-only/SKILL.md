---
name: orval-only
description: >
  API 호출이 Orval 자동생성 훅으로만 수행되는지 검증한다.
  수동 fetch, axios, ky 사용 금지. OpenAPI 스펙 기반 자동생성 훅만 허용.
  Use this skill when: API 호출 코드가 포함된 컴포넌트/훅이 생성될 때.
---

# orval-only — Orval 훅 전용 검증

## 검증 대상
API 호출이 포함된 `*.tsx`, `*.ts` 파일

## 검증 규칙 (절대 규칙)

1. API 호출은 Orval 자동생성 훅(`use*` 패턴)만 사용
2. `fetch(`, `axios.`, `ky.`, `got(` 직접 호출 금지
3. `XMLHttpRequest` 사용 금지

## 검증 방법

```tsx
// PASS — Orval 생성 훅
import { useGetPoints, useCreatePoint } from '@/generated/api';
const { data } = useGetPoints();

// FAIL — 수동 fetch
const res = await fetch('/api/points');

// FAIL — axios
import axios from 'axios';
const { data } = await axios.get('/api/points');
```

## 자동 수정

경고만 출력. Orval 훅 생성은 `pnpm orval` 실행 필요.

## Gotchas

- Orval 설정: `orval.config.ts`에 OpenAPI 스펙 URL 지정
- 훅 자동생성 위치: `src/generated/api/` (프로젝트별 상이)
- SSR에서의 API 호출(서버 컴포넌트)은 Orval 훅이 아닌 서버 함수 허용

## 증거 포맷

```json
{
  "id": "FE-006",
  "category": "frontend/api",
  "rule": "Orval 훅 전용 (절대)",
  "status": "PASS|FAIL",
  "evidence": "Orval 훅만 사용 확인|수동 fetch/axios 발견",
  "violations": ["fetch('/api/points') at line 15"]
}
```
