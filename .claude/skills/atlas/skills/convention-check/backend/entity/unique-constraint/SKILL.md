---
name: unique-constraint
description: >
  비즈니스 고유 식별자(memberId, email 등)에 @Column(unique=true) 또는 @Table(uniqueConstraints)가
  적용되었는지 검증한다. DDL에도 UNIQUE 제약이 있어야 한다.
  Use this skill when: 엔티티 클래스(*Entity.java)가 생성되거나 수정될 때.
---

# unique-constraint — 비즈니스 UNIQUE 제약 검증

## 검증 대상
`*Entity.java` 파일 중 비즈니스 고유 식별자를 가진 엔티티

## 검증 규칙

1. 1:1 관계의 외래키 필드(memberId, userId 등)에는 `@Column(unique = true)` 필수
2. 비즈니스 키(idempotencyKey, email 등)에는 `@Column(unique = true)` 필수
3. 복합 유니크가 필요하면 `@Table(uniqueConstraints = @UniqueConstraint(...))` 사용
4. DDL 마이그레이션에도 `UNIQUE INDEX` 또는 `UNIQUE` 제약이 존재해야 함

## 검증 방법

```java
// PASS — 단일 컬럼 UNIQUE
@Column(unique = true, nullable = false)
private UUID memberId;

// PASS — 복합 UNIQUE
@Table(uniqueConstraints = @UniqueConstraint(
    name = "uk_point_account_member",
    columnNames = {"member_id", "point_type_id"}
))

// FAIL — INDEX만 있고 UNIQUE 없음
// DDL: CREATE INDEX idx_member ON point_account(member_id);
// 엔티티: private UUID memberId;  // @Column(unique) 누락

// FAIL — 1:1 관계인데 UNIQUE 없음
private UUID memberId;  // 1인 복수 계좌 가능 (버그)
```

## 자동 수정

1. `@Column(unique = true)` 추가
2. import `jakarta.persistence.Column` 확인

## Gotchas

- INDEX ≠ UNIQUE. `CREATE INDEX`는 중복을 허용한다
- DDL에서 `UNIQUE INDEX`와 엔티티 `@Column(unique = true)` 양쪽 다 필요
- 계좌-회원 같은 1:1 관계에서 UNIQUE 누락은 심각한 데이터 무결성 문제
- v0.4.0/v0.4.2에서는 달성했으나 v0.4.1/v0.4.3에서 퇴행한 반복 실패 항목

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
