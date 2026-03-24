---
name: optimistic-lock
description: >
  JPA 엔티티에 @Version 낙관적 락이 적용되었는지 검증한다.
  동시성 제어를 위한 프로젝트 수준 결정이며, 모든 엔티티에 필수 적용된다.
  Use this skill when: 엔티티 클래스(*Entity.java)가 생성되거나 수정될 때.
---

# optimistic-lock — @Version 낙관적 락 검증

## 검증 대상
`*Entity.java` 파일

## 검증 규칙

1. `@Version` 어노테이션이 존재해야 한다
2. `private Long version;` 필드가 존재해야 한다
3. version 필드에 setter가 없어야 한다 (JPA가 관리)

## 검증 방법

```java
// PASS
@Entity
public class PointEntity extends BaseEntity {
    @Version
    private Long version;
    // ... 다른 필드
}

// FAIL — @Version 누락
@Entity
public class PointEntity extends BaseEntity {
    private String name;
    // version 필드 없음
}
```

## 자동 수정

1. 클래스 본체에 `@Version private Long version;` 필드 추가
2. `import jakarta.persistence.Version;` 추가
3. DDL 마이그레이션에 `version BIGINT NOT NULL DEFAULT 0` 컬럼이 있는지도 함께 경고

## Gotchas

- @Version은 BaseEntity에 없으므로 **각 엔티티에 직접 선언**해야 한다
- @Version 필드 타입은 `Long` (nullable) 사용. `long`(primitive)은 초기값 0으로 동작이 달라질 수 있음
- version 필드에 `@Column(nullable = false)` 추가 권장
- v0.4.0에서 이 항목이 누락되어 "전진하면서 후퇴" 사례가 발생한 핵심 항목

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
