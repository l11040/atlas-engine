---
name: metadata-export
description: >
  Next.js page.tsx에 metadata export가 존재하는지 검증한다.
  SEO와 페이지 제목을 위해 모든 페이지에 필수.
  Use this skill when: Next.js 페이지(page.tsx)가 생성될 때.
---

# metadata-export — 페이지 metadata 검증

## 검증 대상
`**/page.tsx` 파일

## 검증 규칙

1. `export const metadata` 또는 `export function generateMetadata` 존재
2. metadata에 최소 `title` 필드 포함

## 검증 방법

```typescript
// PASS — static metadata
export const metadata: Metadata = {
  title: '포인트 관리',
};

// PASS — dynamic metadata
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `포인트 ${params.id}` };
}

// FAIL — metadata 없음
export default function PointPage() {
  return <div>...</div>;
}
```

## 자동 수정

`export const metadata: Metadata = { title: '페이지 제목' };` 추가

## Gotchas

- `'use client'` 선언된 page에서는 metadata export 불가 — 서버 컴포넌트 유지 필요
- layout.tsx에 공통 metadata가 있어도 page별 title은 개별 설정 권장

## 증거 포맷

```json
{
  "id": "FE-001",
  "category": "frontend/page",
  "rule": "metadata export",
  "status": "PASS|FAIL",
  "evidence": "metadata 또는 generateMetadata export 확인|누락"
}
```
