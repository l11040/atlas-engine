---
name: version-audited-coexistence
description: >
  mutable 고가치 엔티티에 @Version(동시성 제어)과 @Audited(변경 이력 추적)가 동시 적용되었는지 검증한다.
  두 메커니즘은 기술적으로 완전 독립적이나, AI가 "택1 증후군"으로 한쪽만 적용하는 반복 실패가 발생한다.
  Use this skill when: 금액/잔액 등 mutable 필드를 가진 엔티티가 생성되거나 수정될 때.
---

# version-audited-coexistence — @Version + @Audited 공존 검증

## 검증 대상
`@Entity` 어노테이션이 있는 모든 `.java` 파일 (entity/ 경로 하위)

## 적용 대상 판정

모든 엔티티에 일괄 적용하지 않는다. 아래 기준으로 대상을 판정한다:

| 조건 | @Version | @Audited | DOM-003 |
|------|----------|----------|---------|
| BigDecimal 금액 필드 + 변경 메서드 | 필수 | - | - |
| 금융/포인트/결제 도메인 엔티티 | - | 필수 | - |
| 양쪽 조건 모두 충족 | 필수 | 필수 | **공존 필수** |
| append-only (생성 후 불변) | 제외 | 권고 | 제외 |
| 정책/설정 엔티티 (변경 빈도 극저) | 권고 | 선택 | 제외 |

### 자동 판정 로직

```
1. 엔티티 파일 읽기
2. BigDecimal 필드 + 값 변경 메서드(setter/도메인 메서드) 존재 여부 확인
   → 있으면 @Version 필수 대상
3. 패키지 경로에 point/, payment/, settlement/, billing/ 포함 여부 확인
   → 있으면 @Audited 필수 대상
4. 양쪽 모두 해당하면 → DOM-003 공존 필수
5. 생성자에서만 필드 설정하고 변경 메서드가 없으면 → append-only → 제외
```

## 검증 규칙

1. 공존 필수 대상에 `@Version` + `@Audited` 모두 존재해야 한다
2. `@Audited` 사용 시 `@NotAudited`로 제외할 필드를 명시적으로 결정해야 한다
3. `version` 필드에는 `@NotAudited`를 붙인다 (이력에 의미 없는 기술 필드)

## 검증 방법

```java
// PASS — 양쪽 모두 존재
@Entity
@Audited
public class PointAccount extends BaseEntity {
    @Version
    @NotAudited
    private Long version;

    private BigDecimal availableBalance;

    public void addBalance(BigDecimal amount) {
        this.availableBalance = this.availableBalance.add(amount);
    }
}

// PARTIAL — @Version만 있음
@Entity
public class PointAccount extends BaseEntity {
    @Version
    private Long version;
    // @Audited 누락
}

// PARTIAL — @Audited만 있음
@Entity
@Audited
public class PointAccount extends BaseEntity {
    // @Version 누락
}

// FAIL — 양쪽 모두 부재 (금액 필드 + 변경 메서드 있음)
@Entity
public class PointAccount extends BaseEntity {
    private BigDecimal availableBalance;
    public void addBalance(BigDecimal amount) { ... }
}
```

## 자동 수정

1. `@Version private Long version;` 필드 추가 + import
2. `@Audited` 클래스 어노테이션 추가 + import
3. version 필드에 `@NotAudited` 추가
4. DDL 마이그레이션에 `version BIGINT NOT NULL DEFAULT 0` 컬럼 존재 확인 (경고)

## Gotchas

- `@Audited`는 Hibernate Envers 의존성 필요 — 프로젝트에 envers가 없으면 SKIP
- `@Version`과 `@Audited`는 기술적으로 완전 독립: 하나를 추가해도 다른 하나에 영향 없음
- AI가 "낙관적 락 OR 감사 이력" 중 하나만 선택하는 패턴이 5버전 연속 발생 — 이 스킬의 존재 이유

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
