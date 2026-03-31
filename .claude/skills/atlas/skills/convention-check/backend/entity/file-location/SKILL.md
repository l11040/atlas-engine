---
name: file-location
description: >
  JPA 엔티티 파일이 core/entity/{도메인}/ 하위에 위치하는지 검증한다. (적응형)
  엔티티 클래스명의 Entity 접미사는 프로젝트 패턴에 따라 선택적이다.
  기존 엔티티 파일을 스캔하여 접미사 사용 여부를 자동 감지한다.
  Use this skill when: 엔티티 클래스가 생성될 때.
---

# file-location (entity) — 엔티티 파일 위치 검증 (적응형)

## 검증 대상
`@Entity` 어노테이션이 있는 모든 `.java` 파일

## 패턴 감지 (실행 전 필수)

```
1. 프로젝트의 entity/ 경로에서 @Entity가 있는 기존 파일을 스캔한다
2. Entity 접미사 사용률을 확인한다:
   - 50% 이상이 *Entity.java → Entity 접미사 필수 패턴
   - 50% 미만이 *Entity.java → Entity 접미사 미사용 패턴 (도메인명 그대로)
3. 감지된 패턴에 따라 네이밍 규칙을 적용한다
```

## 검증 규칙

### 공통 규칙 (패턴 무관)

1. 파일 경로가 `core/entity/{도메인}/` 패턴에 맞아야 한다
2. fo, bo, api, admin, vendor, batch 모듈에 엔티티가 위치하면 FAIL

### Entity 접미사 필수 패턴

1. 클래스명이 `{Name}Entity` 접미사를 가져야 한다

```
// PASS
core/entity/point/PointEntity.java

// FAIL — 접미사 누락
core/entity/point/Point.java
```

### Entity 접미사 미사용 패턴

1. 클래스명은 도메인 개념을 직접 표현한다 (Entity 접미사 없음)
2. enum, VO 등 엔티티가 아닌 클래스와 혼재해도 PASS

```
// PASS — 도메인명 그대로 사용
core/entity/point/PointAccount.java
core/entity/point/Grant.java
core/entity/point/GrantStatus.java  // enum도 같은 패키지

// FAIL — 잘못된 모듈
bo/domains/point/entity/PointAccount.java
```

## 자동 수정

파일 이동은 위험하므로 **경고만** 출력. 수동 이동 안내.

## Gotchas

- 프로젝트에 따라 `*Entity.java` 접미사를 사용하지 않는 경우가 있음 (ecommerce-ax 등)
- 기존 엔티티 패턴을 감지하지 않으면 false positive 발생
- `@Entity` 어노테이션 기반으로 엔티티를 식별하는 것이 파일명 패턴보다 정확

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
