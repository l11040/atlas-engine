---
name: dto-naming
description: >
  DTO 클래스의 네이밍과 형식이 컨벤션에 맞는지 검증한다. (적응형)
  record vs class+Lombok, Request vs Req 등 프로젝트마다 패턴이 다르다.
  기존 DTO를 스캔하여 프로젝트의 실제 패턴을 감지한 뒤 검증한다.
  Use this skill when: DTO 클래스(Request/Response)가 생성되거나 수정될 때.
---

# dto-naming — DTO 네이밍/위치 검증 (적응형)

## 검증 대상
`*Request.java`, `*Response.java`, `*Req.java`, `*Res.java` 파일

## 패턴 감지 (실행 전 필수)

```
1. 기존 DTO 파일을 스캔한다 (*Request.java, *Req.java, *Response.java, *Res.java)
2. DTO 형식 판정:
   a. record 사용률 > 50% → record 패턴
   b. class + Lombok 사용률 > 50% → class+Lombok 패턴
   c. 혼용 → 최신 파일의 패턴을 우선
3. 접미사 판정:
   a. *Req.java 사용률 > 50% → Req 접미사
   b. *Request.java 사용률 > 50% → Request 접미사
   c. 혼용 → 최신 파일의 패턴을 우선 (둘 다 허용)
4. DTO 위치 판정:
   a. dto/ 하위에 배치하는 패턴
   b. model/ 하위에 배치하는 패턴
   c. model/request/, model/response/ 하위에 배치하는 패턴
5. 감지된 패턴으로 검증 실행
```

## 검증 규칙

### 공통 규칙

1. Request/Response DTO의 네이밍은 `PascalCase` 필수
2. 생성된 DTO가 프로젝트의 감지된 패턴과 일치해야 한다

### record 패턴

```java
// PASS
public record CreatePointRequest(String name, BigDecimal amount) {}
public record PointDetailResponse(Long id, String name) {}
```

### class + Lombok 패턴

```java
// PASS
@Getter
@NoArgsConstructor
public class CreateGrantRequest {
    @NotNull private BigDecimal amount;
    @NotBlank private String idempotencyKey;
}

@Getter
@Builder
public class GrantResponse {
    private UUID grantId;
    private BigDecimal amount;
}
```

### 접미사 혼용 허용

프로젝트에 `Req`와 `Request`가 혼용되는 경우, **양쪽 모두 PASS**로 처리한다.
일관성 경고(WARN)는 출력하되 FAIL로 처리하지 않는다.

## 자동 수정

네이밍은 영향 범위가 넓으므로 **경고만** 출력.

## Gotchas

- Java 버전이 16 미만이면 record 사용 불가 → class+Lombok이 유일한 선택
- 프로젝트에 따라 Request DTO에 `@Setter`를 쓰는 곳도 있음 (`@ModelAttribute` 바인딩용)
- Response DTO에 `@Setter`는 일반적으로 불필요 — 감지 패턴과 무관하게 경고

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
