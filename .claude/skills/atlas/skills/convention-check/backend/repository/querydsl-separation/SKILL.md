---
name: querydsl-separation
description: >
  복잡한 쿼리가 QueryDSL CustomRepository + Impl 패턴으로 분리되었는지 검증한다.
  Repository에 @Query 네이티브 쿼리가 3개 이상이면 QueryDSL 분리를 권장한다.
  Use this skill when: Repository에 복잡한 쿼리가 추가될 때.
---

# querydsl-separation — QueryDSL 분리 검증

## 검증 대상
`*Repository.java`, `*CustomRepository.java`, `*RepositoryImpl.java` 파일

## 검증 규칙

1. `@Query(nativeQuery = true)` 또는 복잡한 JPQL이 3개 이상이면 CustomRepository 분리 권장
2. CustomRepository 존재 시 Impl 클래스도 존재해야 함
3. Impl 클래스는 `JPAQueryFactory` 사용

## 검증 방법

```java
// PASS — QueryDSL 분리
public interface PointRepository extends JpaRepository<PointEntity, Long>, PointCustomRepository { }
public interface PointCustomRepository { List<PointEntity> findByCondition(PointSearchCondition condition); }
public class PointRepositoryImpl implements PointCustomRepository {
    private final JPAQueryFactory queryFactory;
}

// FAIL — @Query 남발
public interface PointRepository extends JpaRepository<PointEntity, Long> {
    @Query("SELECT p FROM PointEntity p WHERE ...complex...")
    List<PointEntity> findByCondition1(...);
    @Query("SELECT p FROM PointEntity p WHERE ...complex...")
    List<PointEntity> findByCondition2(...);
    @Query(value = "SELECT * FROM point WHERE ...", nativeQuery = true)
    List<PointEntity> findByCondition3(...);
}
```

## 자동 수정

경고만 출력. 쿼리 리팩토링은 수동 처리.

## 증거 포맷

```json
{
  "id": "REP-002",
  "category": "backend/repository",
  "rule": "QueryDSL 분리",
  "status": "PASS|FAIL|WARN",
  "evidence": "QueryDSL 패턴 확인|@Query 3개 이상, 분리 권장",
  "query_count": 5
}
```
