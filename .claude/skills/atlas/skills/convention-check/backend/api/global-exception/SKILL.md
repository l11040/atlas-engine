---
name: global-exception
description: >
  Controller 내부에서 try-catch를 사용하지 않고 GlobalExceptionHandler에 에러 처리를 위임하는지 검증한다.
  Controller에서의 직접 예외 처리는 일관되지 않은 에러 응답을 유발한다.
  Use this skill when: Controller 클래스(*Controller.java)가 생성되거나 수정될 때.
---

# global-exception — GlobalException 위임 검증

## 검증 대상
`*Controller.java` 파일

## 검증 규칙

1. Controller 메서드 내부에 `try-catch` 블록이 없어야 한다
2. `@ExceptionHandler`를 Controller에 직접 선언하지 않아야 한다
3. 비즈니스 예외는 Service에서 throw, GlobalExceptionHandler가 처리

## 검증 방법

```java
// PASS — 예외 처리를 하지 않음 (GlobalExceptionHandler에 위임)
@GetMapping("/{id}")
public ResponseEntity<ApiResponse<PointDetailResponse>> getPoint(@PathVariable Long id) {
    return ResponseEntity.ok(ApiResponse.success(service.getPoint(id)));
}

// FAIL — Controller에서 try-catch
@GetMapping("/{id}")
public ResponseEntity<ApiResponse<PointDetailResponse>> getPoint(@PathVariable Long id) {
    try {
        return ResponseEntity.ok(ApiResponse.success(service.getPoint(id)));
    } catch (Exception e) {
        return ResponseEntity.badRequest().body(ApiResponse.error(e.getMessage()));
    }
}
```

## 자동 수정

1. try-catch 제거
2. catch 내 로직을 GlobalExceptionHandler로 이동 안내

## Gotchas

- GlobalExceptionHandler가 프로젝트에 존재하는지 먼저 확인
- 정말 Controller 레벨에서 잡아야 하는 예외(예: 파일 업로드)는 예외적으로 허용

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
