---
name: response-wrapper
description: >
  Controller의 리턴 타입이 ResponseEntity<ApiResponse<T>> 표준 래퍼를 사용하는지 검증한다.
  직접 Map, String, DTO를 반환하면 API 응답 형식 일관성이 깨진다.
  Use this skill when: Controller 클래스(*Controller.java)가 생성되거나 수정될 때.
---

# response-wrapper — API 응답 래퍼 검증

## 검증 대상
`*Controller.java` 파일의 public 메서드 리턴 타입

## 검증 규칙

1. 모든 public API 메서드의 리턴 타입이 `ResponseEntity<ApiResponse<...>>` 이어야 한다
2. `Map`, `String`, 직접 DTO 반환 금지
3. `void` 반환도 `ResponseEntity<ApiResponse<Void>>`로 래핑

## 검증 방법

```java
// PASS
@GetMapping("/{id}")
public ResponseEntity<ApiResponse<PointDetailResponse>> getPoint(@PathVariable Long id) {
    return ResponseEntity.ok(ApiResponse.success(service.getPoint(id)));
}

// FAIL — 직접 DTO 반환
@GetMapping("/{id}")
public PointDetailResponse getPoint(@PathVariable Long id) {
    return service.getPoint(id);
}

// FAIL — Map 반환
@GetMapping("/stats")
public Map<String, Object> getStats() { }
```

## 자동 수정

1. 리턴 타입을 `ResponseEntity<ApiResponse<기존DTO>>` 로 변경
2. return문을 `ResponseEntity.ok(ApiResponse.success(...))` 로 래핑
3. ApiResponse import 추가

## Gotchas

- ApiResponse는 프로젝트 공통 래퍼 클래스. 위치 확인 필요
- 목록 조회 시 `ApiResponse<List<DTO>>` 또는 `ApiResponse<Page<DTO>>` 형태
- 에러 응답은 GlobalExceptionHandler가 자동 래핑하므로 Controller에서 처리하지 않는다

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
