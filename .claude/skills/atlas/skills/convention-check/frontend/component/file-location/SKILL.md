---
name: file-location
description: >
  페이지 전용 컴포넌트가 _components/ 하위에, 공유 컴포넌트가 features/ 또는 components/에 위치하는지 검증한다.
  Use this skill when: React 컴포넌트 파일(*.tsx)이 생성될 때.
---

# file-location (frontend component) — 컴포넌트 위치 검증

## 검증 대상
`*.tsx` 컴포넌트 파일

## 검증 규칙

1. 페이지 전용 컴포넌트: `app/{경로}/_components/` 하위
2. 기능별 컴포넌트: `features/{feature}/components/` 하위
3. 공유 UI: `components/ui/` (shadcn/ui, 수정 금지)
4. 공유 커스텀: `components/` 하위
5. page.tsx와 같은 디렉토리에 컴포넌트 파일 직접 배치 금지

## 검증 방법

```
// PASS
app/points/_components/point-table.tsx
features/point/components/point-card.tsx
components/ui/button.tsx  (shadcn — 수정 금지)

// FAIL — page.tsx 옆에 직접 배치
app/points/point-table.tsx
```

## 자동 수정

경고만 출력.

## 증거 포맷

```json
{
  "id": "FE-003",
  "category": "frontend/component",
  "rule": "컴포넌트 파일 위치",
  "status": "PASS|FAIL",
  "evidence": "_components/ 또는 features/ 위치 확인|잘못된 위치"
}
```
