---
name: zustand
description: >
  클라이언트 상태 관리에 Zustand를 사용하는지 검증한다.
  Redux, Jotai, Recoil 등 다른 상태 관리 라이브러리 사용 금지.
  Use this skill when: 클라이언트 상태(UI 상태, 폼 상태)가 필요한 컴포넌트가 생성될 때.
---

# zustand — 클라이언트 상태 관리 검증

## 검증 대상
전역 또는 복잡한 클라이언트 상태를 사용하는 `*.tsx`, `*.ts` 파일

## 검증 규칙

1. 전역 클라이언트 상태: `create` (zustand) 사용
2. Redux, Recoil, Jotai, MobX import 금지
3. 단순 로컬 상태는 `useState` 허용 (전역이 아닌 경우)

## 검증 방법

```tsx
// PASS — Zustand
import { create } from 'zustand';
const usePointStore = create((set) => ({
  selectedIds: [],
  toggleSelection: (id) => set(state => ({ ... })),
}));

// FAIL — Redux
import { useSelector, useDispatch } from 'react-redux';
```

## 자동 수정

경고만 출력.

## 증거 포맷

```json
{
  "id": "FE-005",
  "category": "frontend/state",
  "rule": "Zustand 클라이언트 상태",
  "status": "PASS|FAIL|SKIP",
  "evidence": "Zustand 사용 확인|다른 상태 관리 라이브러리 발견|전역 상태 없음"
}
```
