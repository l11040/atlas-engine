---
name: suspense-boundary
description: >
  비동기 데이터를 사용하는 컴포넌트가 Suspense boundary로 감싸져 있는지 검증한다.
  로딩 상태 처리와 Streaming SSR을 위해 필수.
  Use this skill when: Next.js 페이지에 비동기 컴포넌트가 포함될 때.
---

# suspense-boundary — Suspense 래핑 검증

## 검증 대상
`**/page.tsx` 파일

## 검증 규칙

1. 데이터 fetching 컴포넌트를 `<Suspense fallback={...}>` 로 감싸기
2. fallback에 로딩 UI 제공 (빈 Suspense 금지)

## 검증 방법

```tsx
// PASS
export default function PointPage() {
  return (
    <Suspense fallback={<PointSkeleton />}>
      <PointDetail />
    </Suspense>
  );
}

// FAIL — Suspense 없이 비동기 컴포넌트 직접 렌더
export default function PointPage() {
  return <PointDetail />;  // PointDetail이 데이터를 fetch하는 경우
}
```

## 자동 수정

`<Suspense fallback={<div>Loading...</div>}>` 래핑 추가

## Gotchas

- 서버 컴포넌트에서 `await`으로 데이터를 가져오면 Suspense가 자동 작동
- 클라이언트 컴포넌트에서는 `useQuery`의 `isLoading`으로 별도 처리

## 증거 포맷

```json
{
  "id": "FE-002",
  "category": "frontend/page",
  "rule": "Suspense boundary",
  "status": "PASS|FAIL|SKIP",
  "evidence": "Suspense 래핑 확인|래핑 누락|비동기 컴포넌트 없음"
}
```
