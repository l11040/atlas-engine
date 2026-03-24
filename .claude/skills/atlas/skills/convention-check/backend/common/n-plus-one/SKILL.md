---
name: n-plus-one
description: >
  연관관계 로드 시 N+1 문제가 발생하지 않는지 검증한다.
  @EntityGraph 또는 fetch join을 사용해야 한다.
  Use this skill when: 연관관계가 있는 엔티티를 조회하는 Service/Repository가 생성될 때.
---

# n-plus-one — N+1 쿼리 방지 검증

## 검증 대상
연관관계(`@ManyToOne`, `@OneToMany`, `@ManyToMany`)가 있는 엔티티를 조회하는 코드

## 검증 규칙

1. 연관관계 필드를 접근하는 Service 메서드에서 `@EntityGraph` 또는 fetch join 사용
2. `EAGER` 로딩은 금지 (성능 이슈). `LAZY`가 기본
3. 컬렉션 연관관계 반복 접근 시 fetch join 필수

## 검증 방법

```java
// PASS — @EntityGraph
@EntityGraph(attributePaths = {"transactions"})
List<PointAccountEntity> findAllWithTransactions();

// PASS — QueryDSL fetch join
queryFactory.selectFrom(pointAccount)
    .leftJoin(pointAccount.transactions).fetchJoin()
    .fetch();

// FAIL — EAGER 로딩
@OneToMany(fetch = FetchType.EAGER)
private List<TransactionEntity> transactions;

// FAIL — N+1 위험 (LAZY + 반복 접근)
List<PointAccountEntity> accounts = repository.findAll();
accounts.forEach(a -> a.getTransactions().size());  // N+1!
```

## 자동 수정

경고만 출력. N+1 해결은 쿼리 구조 변경이 필요.

## Gotchas

- `@OneToMany`의 기본 fetch는 LAZY (올바름). 명시적으로 EAGER로 변경하지 않도록 주의
- fetch join과 페이징을 함께 쓰면 메모리 페이징이 발생 — `@BatchSize` 또는 별도 쿼리 고려

## 증거 포맷

```json
{
  "id": "CMN-004",
  "category": "backend/common",
  "rule": "N+1 쿼리 방지",
  "status": "PASS|FAIL|SKIP",
  "evidence": "fetch join/@EntityGraph 사용 확인|EAGER 또는 N+1 위험 패턴 발견|연관관계 없음"
}
```
