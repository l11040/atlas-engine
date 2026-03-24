---
name: base-entity
description: >
  모든 JPA 엔티티가 BaseEntity를 상속하는지 검증한다. BaseEntity는 id, createdAt, updatedAt을
  제공하므로 중복 선언을 방지하고 일관된 기본 필드를 보장한다.
  Use this skill when: 엔티티 클래스(*Entity.java)가 생성되거나 수정될 때.
---

# base-entity — BaseEntity 상속 검증

## 검증 대상
`*Entity.java` 파일

## 검증 규칙

1. 클래스 선언에 `extends BaseEntity`가 존재해야 한다
2. `id`, `createdAt`, `updatedAt` 필드를 직접 선언하면 안 된다 (BaseEntity가 제공)

## 검증 방법

```java
// PASS — BaseEntity 상속
@Entity
public class PointEntity extends BaseEntity {
    // id, createdAt, updatedAt은 BaseEntity에서 상속
}

// FAIL — 상속 누락
@Entity
public class PointEntity {
    @Id @GeneratedValue
    private Long id;  // BaseEntity가 제공하므로 중복
}
```

## 자동 수정

1. `extends BaseEntity` 추가
2. 중복 필드(id, createdAt, updatedAt) 제거
3. BaseEntity import 추가: `import com.softsquared.template.ecommerce.core.entity.BaseEntity;`

## Gotchas

- BaseEntity는 `@MappedSuperclass`이므로 테이블에 직접 매핑되지 않는다
- `@Id`, `@GeneratedValue`를 엔티티에 직접 선언하면 BaseEntity의 id와 충돌한다
- Embeddable 클래스는 BaseEntity를 상속하지 않는다 (검증 제외)

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
