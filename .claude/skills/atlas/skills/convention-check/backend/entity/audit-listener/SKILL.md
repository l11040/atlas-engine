---
name: audit-listener
description: >
  JPA 엔티티에 @EntityListeners(AuditingEntityListener.class) Audit 리스너가 적용되었는지 검증한다.
  createdAt/updatedAt 자동 관리를 위한 필수 어노테이션.
  Use this skill when: 엔티티 클래스(*Entity.java)가 생성되거나 수정될 때.
---

# audit-listener — Audit 리스너 검증

## 검증 대상
`*Entity.java` 파일

## 검증 규칙

1. `@EntityListeners(AuditingEntityListener.class)` 어노테이션이 클래스에 존재해야 한다

## 검증 방법

```java
// PASS
@Entity
@EntityListeners(AuditingEntityListener.class)
public class PointEntity extends BaseEntity { }

// FAIL — 리스너 누락
@Entity
public class PointEntity extends BaseEntity { }
```

## 자동 수정

1. `@EntityListeners(AuditingEntityListener.class)` 추가
2. `import jakarta.persistence.EntityListeners;` 추가
3. `import org.springframework.data.jpa.domain.support.AuditingEntityListener;` 추가

## Gotchas

- BaseEntity에 `@EntityListeners`가 선언되어 있으면 하위 엔티티에서 중복 선언 불필요
- 프로젝트의 BaseEntity 구현을 먼저 확인하고, BaseEntity에 없을 경우에만 FAIL 처리
- `@EnableJpaAuditing` 설정이 Configuration에 있어야 실제로 동작한다

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
