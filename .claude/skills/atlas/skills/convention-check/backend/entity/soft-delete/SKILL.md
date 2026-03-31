---
name: soft-delete
description: >
  JPA 엔티티에 Soft Delete 패턴이 적용되었는지 검증한다. (적응형)
  프로젝트별로 deletedAt/@SQLRestriction 또는 status enum/BaseEntity.delete() 등 다양한 패턴을 사용한다.
  실행 전 BaseEntity를 읽어 프로젝트의 실제 패턴을 감지한 뒤 해당 패턴으로 검증한다.
  Use this skill when: 엔티티 클래스가 생성되거나 수정될 때.
---

# soft-delete — Soft Delete 패턴 검증 (적응형)

## 검증 대상
`@Entity` 어노테이션이 있는 모든 `.java` 파일

## 패턴 감지 (실행 전 필수)

**검증 규칙을 적용하기 전에 반드시 프로젝트의 soft-delete 패턴을 감지한다.**

```
1. BaseEntity 파일을 찾아 읽는다 (BaseEntity.java, Base.java 등)
2. 패턴 판정:
   a. "deletedAt" 필드 + @SQLRestriction 또는 @Where 존재
      → deletedAt 패턴
   b. "status" enum 필드 (ACTIVE/INACTIVE) + delete() 메서드 존재
      → status enum 패턴
   c. @SoftDelete 어노테이션 (Hibernate 6.4+)
      → Hibernate SoftDelete 패턴
   d. 위 모두 해당 없음
      → WARN "soft-delete 패턴 미식별" (SKIP)
3. 감지된 패턴에 맞는 검증 규칙을 적용한다
```

## 검증 규칙

### 패턴 A: deletedAt 방식

1. `@SQLRestriction("deleted_at IS NULL")` 어노테이션이 클래스에 존재해야 한다
2. `private LocalDateTime deletedAt;` 필드가 BaseEntity 또는 엔티티에 존재해야 한다
3. 물리 삭제 메서드 직접 호출 금지

```java
// PASS
@Entity
@SQLRestriction("deleted_at IS NULL")
public class PointEntity extends BaseEntity {
    private LocalDateTime deletedAt;
}
```

### 패턴 B: status enum 방식

1. BaseEntity에 `status` 필드 (ACTIVE/INACTIVE enum)가 존재해야 한다
2. 엔티티 또는 BaseEntity에 `delete()` 메서드가 status를 INACTIVE로 변경해야 한다
3. QueryDSL/Repository에서 `notDeleted()` 조건을 사용해야 한다
4. 물리 삭제 메서드 직접 호출 금지

```java
// PASS — status enum 패턴
@Entity
public class PointAccount extends BaseEntity {
    // BaseEntity에서 status + delete() 상속
}

// BaseEntity 예시
@MappedSuperclass
public abstract class BaseEntity {
    @Enumerated(EnumType.STRING)
    private Status status = Status.ACTIVE;

    public void delete() { this.status = Status.INACTIVE; }
}
```

### 패턴 C: Hibernate @SoftDelete

1. `@SoftDelete` 어노테이션이 클래스 또는 BaseEntity에 존재해야 한다

## 자동 수정

감지된 패턴에 따라:
- **deletedAt 패턴**: `@SQLRestriction` + `deletedAt` 필드 추가
- **status 패턴**: BaseEntity 상속 확인 + `delete()` 메서드 사용 안내
- **SoftDelete 패턴**: `@SoftDelete` 어노테이션 추가

## Gotchas

- 프로젝트마다 패턴이 다르므로 **반드시 BaseEntity를 먼저 읽어야** 한다
- `@SQLRestriction`은 Hibernate 6.3+ 전용. `@Where`는 deprecated
- status enum 방식에서는 QueryDSL에서 `notDeleted()` 필터를 누락하지 않도록 주의
- BaseQueryDslRepository 같은 공통 유틸이 있다면 해당 유틸 사용 여부도 검증

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
