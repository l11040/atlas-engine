---
name: swagger-docs
description: >
  Controller에 @Tag와 @Operation Swagger 어노테이션이 적용되었는지 검증한다.
  API 문서 자동 생성을 위한 필수 어노테이션.
  Use this skill when: Controller 클래스(*Controller.java)가 생성되거나 수정될 때.
---

# swagger-docs — Swagger 어노테이션 검증

## 검증 대상
`*Controller.java` 파일

## 검증 규칙

1. 클래스에 `@Tag(name = "도메인명")` 존재
2. 모든 public API 메서드에 `@Operation(summary = "설명")` 존재
3. summary는 한국어 동사형 ("포인트 상세 조회", "포인트 적립")

## 검증 방법

```java
// PASS
@Tag(name = "포인트")
@RestController
public class PointController {
    @Operation(summary = "포인트 상세 조회")
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<PointDetailResponse>> getPoint(...) { }
}

// FAIL — @Tag 누락
@RestController
public class PointController { }

// FAIL — @Operation 누락
@GetMapping("/{id}")
public ResponseEntity<ApiResponse<PointDetailResponse>> getPoint(...) { }
```

## 자동 수정

1. 클래스에 `@Tag(name = "도메인명")` 추가 (클래스명에서 도메인 추출)
2. 각 메서드에 `@Operation(summary = "")` 추가 (메서드명에서 요약 생성)
3. import 추가: `io.swagger.v3.oas.annotations.Operation`, `io.swagger.v3.oas.annotations.tags.Tag`

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
