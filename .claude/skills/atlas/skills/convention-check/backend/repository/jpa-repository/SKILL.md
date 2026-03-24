---
name: jpa-repository
description: >
  Repository가 JpaRepository<Entity, Long>을 상속하는지 검증한다.
  Use this skill when: Repository 인터페이스(*Repository.java)가 생성될 때.
---

# jpa-repository — JpaRepository 상속 검증

## 검증 대상
`*Repository.java` 파일

## 검증 규칙

1. `extends JpaRepository<{Entity}, Long>` 패턴
2. 위치: `core/repository/{도메인}/`
3. 네이밍: `{Entity명에서 Entity 접미사 제거}Repository`

## 검증 방법

```java
// PASS
public interface PointRepository extends JpaRepository<PointEntity, Long> { }

// FAIL — CrudRepository 사용
public interface PointRepository extends CrudRepository<PointEntity, Long> { }
```

## 자동 수정

`CrudRepository` → `JpaRepository` 변경

## 증거 포맷

```json
{
  "id": "REP-001",
  "category": "backend/repository",
  "rule": "JpaRepository 상속",
  "status": "PASS|FAIL"
}
```
