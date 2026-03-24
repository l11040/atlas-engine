---
name: soft-delete
description: >
  JPA 엔티티에 Soft Delete 패턴(@SQLRestriction + deletedAt 필드)이 적용되었는지 검증한다.
  물리 삭제를 금지하고 논리 삭제만 허용하는 프로젝트 수준 결정.
  Use this skill when: 엔티티 클래스(*Entity.java)가 생성되거나 수정될 때.
---

# soft-delete — Soft Delete 패턴 검증

## 검증 대상
`*Entity.java` 파일

## 검증 규칙

1. `@SQLRestriction("deleted_at IS NULL")` 어노테이션이 클래스에 존재해야 한다
2. `private LocalDateTime deletedAt;` 필드가 존재해야 한다
3. 물리 삭제 메서드(`deleteById`, `delete`)를 직접 호출하는 코드가 없어야 한다

## 검증 방법

```java
// PASS
@Entity
@SQLRestriction("deleted_at IS NULL")
public class PointEntity extends BaseEntity {
    private LocalDateTime deletedAt;
}

// FAIL — @SQLRestriction 누락
@Entity
public class PointEntity extends BaseEntity {
    // deletedAt 필드도 없음
}

// FAIL — 구버전 어노테이션 사용
@Entity
@Where(clause = "deleted_at IS NULL")  // Hibernate 6.3 이전 방식
public class PointEntity extends BaseEntity { }
```

## 자동 수정

1. `@SQLRestriction("deleted_at IS NULL")` 클래스 어노테이션 추가
2. `private LocalDateTime deletedAt;` 필드 추가
3. `import org.hibernate.annotations.SQLRestriction;` 추가
4. `@Where` → `@SQLRestriction` 마이그레이션 (Hibernate 6.3+)

## Gotchas

- `@SQLRestriction`은 Hibernate 6.3+ 전용. `@Where`는 deprecated
- Soft Delete된 레코드는 `@SQLRestriction` 덕분에 자동으로 쿼리에서 제외된다
- 삭제된 데이터를 조회하려면 네이티브 쿼리 또는 별도 뷰가 필요
- Repository에서 `deleteById` 호출 시 실제로는 `deletedAt = now()` 업데이트를 수행하는 커스텀 구현이 필요

## 증거 포맷

```json
{
  "id": "ENT-003",
  "category": "backend/entity",
  "rule": "Soft Delete 패턴",
  "status": "PASS|FAIL",
  "evidence": "@SQLRestriction + deletedAt 확인|패턴 누락",
  "file": "대상 파일 경로",
  "fix_applied": false,
  "fix_hint": "@SQLRestriction(\"deleted_at IS NULL\") + deletedAt 필드 추가"
}
```
