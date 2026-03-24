---
name: dto-naming
description: >
  DTO 클래스의 네이밍과 위치가 컨벤션에 맞는지 검증한다.
  Request는 {Action}{Domain}Request, Response는 {Domain}{Action}Response record 패턴.
  Use this skill when: DTO 클래스(Request/Response)가 생성되거나 수정될 때.
---

# dto-naming — DTO 네이밍/위치 검증

## 검증 대상
`*Request.java`, `*Response.java` 파일

## 검증 규칙

1. Request DTO: `{Action}{Domain}Request` 패턴 (예: `CreatePointRequest`)
2. Response DTO: `{Domain}{Action}Response` 패턴 (예: `PointDetailResponse`)
3. DTO는 `record` 타입으로 선언 (class 아닌 record)
4. 위치: `{module}/domains/{도메인}/dto/` 하위

## 검증 방법

```java
// PASS
public record CreatePointRequest(String name, BigDecimal amount) {}
public record PointDetailResponse(Long id, String name) {}

// FAIL — 네이밍
public record PointCreateReq(String name) {}  // Req 약어 사용
public class CreatePointRequest { }           // record가 아닌 class
```

## 자동 수정

네이밍은 영향 범위가 넓으므로 **경고만** 출력.

## 증거 포맷

```json
{
  "id": "API-004",
  "category": "backend/api",
  "rule": "DTO 네이밍 컨벤션",
  "status": "PASS|FAIL",
  "evidence": "네이밍 + record 타입 확인|패턴 불일치",
  "file": "대상 파일 경로"
}
```
