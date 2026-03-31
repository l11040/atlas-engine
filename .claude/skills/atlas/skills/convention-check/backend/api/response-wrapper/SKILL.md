---
name: response-wrapper
description: >
  Controller의 리턴 타입이 프로젝트의 표준 응답 래퍼를 사용하는지 검증한다. (적응형)
  프로젝트별로 래퍼 클래스명이 다르다 (ApiResponse, BaseResponse, CommonResponse 등).
  기존 Controller를 스캔하여 프로젝트의 실제 래퍼를 감지한 뒤 검증한다.
  Use this skill when: Controller 클래스(*Controller.java)가 생성되거나 수정될 때.
---

# response-wrapper — API 응답 래퍼 검증 (적응형)

## 검증 대상
`*Controller.java` 파일의 public 메서드 리턴 타입

## 래퍼 감지 (실행 전 필수)

**검증 규칙을 적용하기 전에 반드시 프로젝트의 응답 래퍼 패턴을 감지한다.**

```
1. 프로젝트의 공통 응답 클래스를 검색한다:
   - "*Response.java" 중 제네릭 타입 파라미터를 가진 클래스 (ApiResponse<T>, BaseResponse<T> 등)
   - 또는 conventions.json의 patterns.response_wrapper 참조
2. 기존 Controller 파일에서 리턴 타입 패턴을 분석한다:
   a. ResponseEntity<WrapperClass<T>> 패턴
   b. WrapperClass<T> 직접 반환 패턴
   c. 혼용 패턴 (다수결)
3. 감지된 래퍼 클래스 + 반환 패턴으로 검증 실행
```

## 검증 규칙

### 감지된 래퍼에 따라 검증

1. 모든 public API 메서드의 리턴 타입이 **감지된 래퍼 패턴**을 따라야 한다
2. `Map`, `String`, 직접 DTO 반환 금지
3. `void` 반환도 래퍼로 감싸야 함

## 검증 방법

```java
// 래퍼가 ResponseEntity<ApiResponse<T>>로 감지된 경우:
// PASS
public ResponseEntity<ApiResponse<PointResponse>> getPoint(...) { }

// 래퍼가 BaseResponse<T> 직접 반환으로 감지된 경우:
// PASS
public BaseResponse<PointResponse> getPoint(...) { }

// 공통 FAIL — 래퍼 없이 직접 DTO 반환
public PointResponse getPoint(...) { }
```

## 자동 수정

1. 리턴 타입을 감지된 래퍼 패턴으로 변경
2. return문을 래퍼 생성 패턴에 맞게 변경
3. 래퍼 클래스 import 추가

## Gotchas

- 프로젝트마다 래퍼 클래스명이 다름: `ApiResponse`, `BaseResponse`, `CommonResponse`, `RestResponse` 등
- 래퍼 사용 방식도 다름: `ResponseEntity`로 감싸는 곳 vs 직접 반환하는 곳
- 래퍼를 감지하지 못하면 WARN으로 처리하고 스킵 (하드코딩 패턴 강제 금지)

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
