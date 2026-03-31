---
name: optimistic-lock
description: >
  동시성 위험이 있는 JPA 엔티티에 @Version 낙관적 락이 적용되었는지 검증한다. (조건부 적용)
  모든 엔티티가 아니라 mutable BigDecimal 필드가 있는 엔티티 등 동시성 위험이 실제로 존재하는 대상만 필수.
  Use this skill when: 엔티티 클래스가 생성되거나 수정될 때.
---

# optimistic-lock — @Version 낙관적 락 검증 (조건부 적용)

## 검증 대상
`@Entity` 어노테이션이 있는 모든 `.java` 파일

## 적용 대상 판정

**모든 엔티티에 일괄 적용하지 않는다.** 아래 기준으로 필수/권고/제외를 결정한다:

| 조건 | 판정 | 예시 |
|------|------|------|
| BigDecimal/금액 필드 + 변경 메서드 존재 | **필수** | PointAccount (잔액 변경) |
| 재고/수량 필드 + 변경 메서드 존재 | **필수** | Product (stock 변경) |
| 상태 전이 메서드가 복수 존재 (경쟁 조건 가능) | **필수** | Grant (PENDING→AVAILABLE→SPENT) |
| append-only (생성 후 불변, 변경 메서드 없음) | **제외** | LedgerEntry, SpendHold (생성 후 confirm/reverse만) |
| 정책/설정 엔티티 (변경 빈도 극저) | **권고** | EarnPolicy, ExpirationPolicy |

### 자동 판정 로직

```
1. 엔티티 파일 읽기
2. BigDecimal/Integer 필드 중 값을 변경하는 메서드가 있는지 확인
   → add*, subtract*, update*, set* 등 필드 값 변경 패턴
3. 변경 메서드가 2개 이상 + 동시 호출 가능성이 있으면 → 필수
4. 생성자에서만 필드 설정하고 이후 불변이면 → 제외
5. 판정 불확실하면 → 권고 (WARN)
```

## 검증 규칙

1. **필수 대상**: `@Version` 어노테이션 + `private Long version;` 필드가 존재해야 한다
2. **권고 대상**: 없으면 WARN (FAIL 아님)
3. **제외 대상**: 검증 스킵
4. version 필드에 setter가 없어야 한다 (JPA가 관리)

## 검증 방법

```java
// PASS — 필수 대상에 @Version 존재
@Entity
public class PointAccount extends BaseEntity {
    @Version
    private Long version;
    private BigDecimal availableBalance;
    public void addBalance(BigDecimal amount) { ... }
}

// PASS — append-only 엔티티에 @Version 없어도 OK
@Entity
public class LedgerEntry extends BaseEntity {
    private BigDecimal amount;  // 생성 후 불변
    // 변경 메서드 없음
}

// FAIL — 필수 대상인데 @Version 누락
@Entity
public class PointAccount extends BaseEntity {
    private BigDecimal availableBalance;
    public void addBalance(BigDecimal amount) { ... }
    // @Version 없음
}
```

## 자동 수정

1. 클래스 본체에 `@Version private Long version;` 필드 추가
2. `import jakarta.persistence.Version;` 추가
3. DDL 마이그레이션에 `version BIGINT NOT NULL DEFAULT 0` 컬럼이 있는지도 함께 경고

## Gotchas

- @Version 필드 타입은 `Long` (nullable) 사용. `long`(primitive)은 초기값 0으로 동작이 달라질 수 있음
- version 필드에 `@Column(nullable = false)` 추가 권장
- append-only 엔티티에 @Version을 불필요하게 추가하면 오히려 비용만 증가

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
