---
name: n-plus-one-batch
description: >
  Spring Batch Reader/Processor에서 N+1 쿼리가 발생하지 않는지 검증한다.
  Processor 내부에서 개별 findById 호출은 N+1 패턴이다.
  Use this skill when: Spring Batch Config/Processor가 생성될 때.
---

# n-plus-one-batch — Batch N+1 쿼리 방지 검증

## 검증 대상
`*Config.java`, `*Processor.java` (Spring Batch)

## 검증 규칙

1. Processor에서 `repository.findById()` / `repository.findBy*()` 개별 호출 금지
2. Reader JPQL에 연관 엔티티 JOIN FETCH 사용
3. 또는 Reader에서 IN 쿼리로 관련 엔티티를 일괄 조회 후 Map으로 전달

## 검증 방법

```java
// PASS — Reader에서 JOIN FETCH
@Bean
public JpaPagingItemReader<Grant> reader() {
    return new JpaPagingItemReaderBuilder<Grant>()
        .queryString("SELECT g FROM Grant g JOIN FETCH g.account WHERE ...")
        .build();
}

// PASS — Processor에서 일괄 조회 + Map 캐시
// Step 시작 시 Map<UUID, PointAccount> 로드

// FAIL — Processor에서 개별 조회
@Override
public Grant process(Grant grant) {
    PointAccount account = accountRepository.findById(grant.getAccountId())  // N+1!
        .orElseThrow();
    account.addAvailableBalance(grant.getRemaining());
    return grant;
}
```

## 자동 수정

경고만 출력. Reader JPQL 변경 또는 일괄 조회 패턴은 구조 변경 필요.

## Gotchas

- 기존 `n-plus-one` 스킬(CMN-004)은 Service/Repository 대상. 이 스킬은 Batch 전용
- `JpaPagingItemReader`는 기본적으로 연관관계를 LAZY 로드하므로 Processor에서 접근 시 N+1
- chunk 크기(예: 100)만큼 N+1이 발생하므로 성능 영향이 큼
- v0.4.0(IN 쿼리), v0.4.2(JOIN FETCH)에서 해결했으나 v0.4.1/v0.4.3에서 퇴행

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
