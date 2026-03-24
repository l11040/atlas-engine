---
name: idempotency
description: >
  부작용이 있는 API(POST 생성, 결제, 주문)에 멱등성 처리가 구현되었는지 검증한다.
  네트워크 재시도 시 중복 처리를 방지하기 위한 프로젝트 수준 결정.
  Use this skill when: POST/PUT API가 생성될 때. 특히 결제, 주문, 포인트 적립 등 부작용 API.
---

# idempotency — 멱등성 패턴 검증

## 검증 대상
`*Controller.java`의 POST/PUT 메서드, 관련 Service

## 검증 규칙

1. 부작용 있는 POST API에 멱등키(Idempotency-Key) 헤더 또는 파라미터 존재
2. Service에서 멱등키 기반 중복 체크 로직 존재
3. 단순 조회(GET), 삭제(DELETE)는 검증 제외

## 검증 방법

```java
// PASS — 멱등키 파라미터
@PostMapping
public ResponseEntity<ApiResponse<EarnPointsResponse>> earnPoints(
    @RequestHeader("Idempotency-Key") String idempotencyKey,
    @RequestBody EarnPointsRequest request) {
    return ResponseEntity.ok(ApiResponse.success(service.earnPoints(idempotencyKey, request)));
}

// Service에서 중복 체크
public EarnPointsResponse earnPoints(String idempotencyKey, EarnPointsRequest request) {
    if (idempotencyRepository.existsByKey(idempotencyKey)) {
        return idempotencyRepository.getResult(idempotencyKey);
    }
    // ... 실제 처리
}

// FAIL — 멱등키 없는 부작용 API
@PostMapping
public ResponseEntity<ApiResponse<EarnPointsResponse>> earnPoints(
    @RequestBody EarnPointsRequest request) {
    return ResponseEntity.ok(ApiResponse.success(service.earnPoints(request)));
}
```

## 자동 수정

경고만 출력. 멱등성 구현은 설계 결정이 필요.

## Gotchas

- 모든 POST가 멱등키를 필요로 하지는 않음. 부작용(돈, 포인트, 재고 변경)이 있는 API에 집중
- 멱등키 저장소: DB 테이블 또는 Caffeine 캐시 (TTL 기반)
- 결제 API는 필수, 단순 CRUD 생성은 권장 수준

## 증거 포맷

```json
{
  "id": "CMN-003",
  "category": "backend/common",
  "rule": "멱등성 패턴",
  "status": "PASS|FAIL|SKIP",
  "evidence": "멱등키 파라미터 + 중복 체크 확인|부작용 API에 멱등키 없음|부작용 API 아님"
}
```
