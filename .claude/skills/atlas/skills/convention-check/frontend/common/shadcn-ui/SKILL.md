---
name: shadcn-ui
description: >
  UI 컴포넌트가 shadcn/ui 라이브러리를 사용하는지 검증한다.
  직접 HTML 요소 스타일링 대신 shadcn/ui 컴포넌트 활용을 권장.
  Use this skill when: UI 컴포넌트를 포함하는 TSX 파일이 생성될 때.
---

# shadcn-ui — UI 라이브러리 사용 검증

## 검증 대상
UI 요소를 포함하는 `*.tsx` 파일

## 검증 규칙

1. Button, Input, Select 등 기본 UI는 `@/components/ui/` import
2. `components/ui/` 파일 직접 수정 금지 (shadcn이 관리)
3. MUI, Ant Design, Chakra UI 등 다른 UI 라이브러리 import 금지

## 검증 방법

```tsx
// PASS
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// FAIL — 직접 스타일링
<button className="bg-blue-500 text-white px-4 py-2 rounded">Submit</button>

// FAIL — 다른 UI 라이브러리
import { Button } from '@mui/material';
```

## 자동 수정

경고 + shadcn/ui 컴포넌트 대체 안내.

## Gotchas

- shadcn/ui는 `npx shadcn-ui add <component>`로 추가
- 기존 컴포넌트 커스터마이징은 해당 컴포넌트를 래핑하는 별도 컴포넌트 생성

## 증거 포맷

```json
{
  "id": "FE-009",
  "category": "frontend/common",
  "rule": "shadcn/ui 사용",
  "status": "PASS|FAIL|SKIP",
  "evidence": "shadcn/ui import 확인|다른 UI 라이브러리 또는 직접 스타일링|UI 요소 없음"
}
```
