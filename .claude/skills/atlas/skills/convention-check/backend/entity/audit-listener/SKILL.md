---
name: audit-listener
description: >
  JPA 엔티티에 createdAt/updatedAt 자동 관리 메커니즘이 적용되었는지 검증한다. (적응형)
  프로젝트별로 @EntityListeners, @CreationTimestamp/@UpdateTimestamp, @PrePersist/@PreUpdate 등
  다양한 메커니즘을 사용한다. BaseEntity를 읽어 프로젝트의 실제 메커니즘을 감지한 뒤 검증한다.
  Use this skill when: 엔티티 클래스가 생성되거나 수정될 때.
---

# audit-listener — Audit 메커니즘 검증 (적응형)

## 검증 대상
`@Entity` 어노테이션이 있는 모든 `.java` 파일

## 메커니즘 감지 (실행 전 필수)

**검증 규칙을 적용하기 전에 반드시 BaseEntity의 audit 메커니즘을 감지한다.**

```
1. BaseEntity 파일을 찾아 읽는다
2. 메커니즘 판정:
   a. @EntityListeners(AuditingEntityListener.class) + @CreatedDate/@LastModifiedDate
      → Spring Data JPA Auditing 방식
   b. @CreationTimestamp / @UpdateTimestamp (Hibernate 어노테이션)
      → Hibernate Timestamp 방식
   c. @PrePersist / @PreUpdate 콜백 메서드
      → JPA 콜백 방식
   d. 위 모두 해당 없음
      → WARN "audit 메커니즘 미식별"
3. 감지된 메커니즘에 맞는 검증 규칙을 적용한다
```

## 검증 규칙

### 메커니즘 A: Spring Data JPA Auditing

1. BaseEntity에 `@EntityListeners(AuditingEntityListener.class)` 존재 확인
2. BaseEntity에 `@CreatedDate`, `@LastModifiedDate` 필드 존재 확인
3. Configuration에 `@EnableJpaAuditing` 존재 확인
4. BaseEntity에 이미 선언되어 있으면 하위 엔티티는 자동 PASS

### 메커니즘 B: Hibernate Timestamp

1. BaseEntity에 `@CreationTimestamp` + `@UpdateTimestamp` 존재 확인
2. 해당 필드의 타입이 `LocalDateTime` 확인
3. BaseEntity에 이미 선언되어 있으면 하위 엔티티는 자동 PASS

### 메커니즘 C: JPA 콜백

1. BaseEntity에 `@PrePersist` / `@PreUpdate` 메서드 존재 확인
2. 해당 메서드에서 `createdAt` / `updatedAt` 필드 설정 확인

## 검증 방법

```java
// PASS — 메커니즘 A
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class BaseEntity {
    @CreatedDate private LocalDateTime createdAt;
    @LastModifiedDate private LocalDateTime updatedAt;
}

// PASS — 메커니즘 B
@MappedSuperclass
public abstract class BaseEntity {
    @CreationTimestamp private LocalDateTime createdAt;
    @UpdateTimestamp private LocalDateTime updatedAt;
}

// PASS — 메커니즘 C
@MappedSuperclass
public abstract class BaseEntity {
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() { this.createdAt = LocalDateTime.now(); }

    @PreUpdate
    protected void onUpdate() { this.updatedAt = LocalDateTime.now(); }
}
```

## 자동 수정

감지된 메커니즘에 따라:
- **Spring Data JPA**: `@EntityListeners` + `@CreatedDate` / `@LastModifiedDate` 추가
- **Hibernate**: `@CreationTimestamp` / `@UpdateTimestamp` 추가
- **JPA 콜백**: `@PrePersist` / `@PreUpdate` 메서드 추가

## Gotchas

- BaseEntity에 메커니즘이 적용되어 있으면 하위 엔티티는 검증 대상에서 제외
- 세 가지 방식을 혼용하면 동작이 불명확 — 하나의 방식만 사용하는지 확인
- `@EnableJpaAuditing`은 메커니즘 A에서만 필요

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
