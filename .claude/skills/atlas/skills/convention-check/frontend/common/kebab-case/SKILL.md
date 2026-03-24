---
name: kebab-case
description: >
  프론트엔드 파일명이 kebab-case인지 검증한다. PascalCase, camelCase, snake_case 금지.
  Use this skill when: TSX/TS 파일이 생성될 때.
---

# kebab-case — 파일명 케이스 검증

## 검증 대상
`*.tsx`, `*.ts` 파일명

## 검증 규칙

1. 파일명이 kebab-case: `point-detail.tsx`, `use-point-store.ts`
2. PascalCase 금지: `PointDetail.tsx` → FAIL
3. camelCase 금지: `pointDetail.tsx` → FAIL
4. 예외: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx` (Next.js 규칙)

## 검증 방법

```
// PASS
point-detail.tsx
use-point-store.ts
point-table-columns.tsx

// FAIL
PointDetail.tsx
usePointStore.ts
point_detail.tsx
```

## 자동 수정

파일 이름 변경 + import 경로 일괄 수정 안내.

## 증거 포맷

```json
{
  "id": "FE-008",
  "category": "frontend/common",
  "rule": "파일명 kebab-case",
  "status": "PASS|FAIL",
  "evidence": "kebab-case 확인|케이스 불일치",
  "current_name": "PointDetail.tsx",
  "suggested_name": "point-detail.tsx"
}
```
