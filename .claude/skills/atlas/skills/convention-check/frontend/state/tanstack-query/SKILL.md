---
name: tanstack-query
description: >
  서버 상태 관리에 TanStack Query(useQuery, useMutation)를 사용하는지 검증한다.
  useState로 API 응답을 관리하면 캐싱, 재검증, 에러 처리가 누락된다.
  Use this skill when: API 데이터를 사용하는 컴포넌트가 생성될 때.
---

# tanstack-query — 서버 상태 관리 검증

## 검증 대상
API 데이터를 사용하는 `*.tsx`, `*.ts` 파일

## 검증 규칙

1. API 데이터 조회: `useQuery` 사용
2. API 데이터 변경: `useMutation` 사용
3. `useState` + `useEffect` + `fetch` 조합 금지 (TanStack Query 대체)

## 검증 방법

```tsx
// PASS — useQuery 사용
const { data, isLoading } = useGetPoints();  // Orval 생성 훅

// FAIL — useState + useEffect
const [points, setPoints] = useState([]);
useEffect(() => {
  fetch('/api/points').then(r => r.json()).then(setPoints);
}, []);
```

## 자동 수정

경고만 출력. 상태 관리 패턴 변경은 수동 처리.

## 증거 포맷

```json
{
  "id": "FE-004",
  "category": "frontend/state",
  "rule": "TanStack Query 서버 상태",
  "status": "PASS|FAIL|SKIP",
  "evidence": "useQuery/useMutation 사용 확인|useState+useEffect+fetch 패턴 발견|API 데이터 없음"
}
```
