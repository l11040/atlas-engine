---
name: jpa-relation
description: >
  엔티티 간 관계를 JPA 연관관계(@ManyToOne 등)로 매핑했는지 검증한다.
  ID 참조만으로는 FK 무결성이 DB 레벨에서 보장되지 않는다.
  Use this skill when: 다른 엔티티를 참조하는 필드가 있는 엔티티가 생성될 때.
---

# jpa-relation — JPA 연관관계 매핑 검증

## 검증 대상
`*Entity.java` 파일 중 다른 엔티티의 ID를 참조하는 필드가 있는 클래스

## 검증 규칙

1. 다른 엔티티를 참조하는 필드는 `@ManyToOne` / `@OneToOne` 연관관계 사용
2. `UUID accountId` 같은 ID 참조만으로는 FAIL (FK 미보장)
3. 연관관계에는 `fetch = FetchType.LAZY` 필수
4. 예외: Task AC에서 명시적으로 ID 참조를 지정한 경우 override로 기록

## 검증 방법

```java
// PASS — JPA 연관관계
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "account_id", nullable = false)
private PointAccount account;

// FAIL — ID 참조만 (FK 미보장)
@Column(nullable = false)
private UUID accountId;

// PASS — override 명시 (AC가 ID 참조 지정)
// override: { decision: "ac", reason: "티켓 AC에서 ID 참조 패턴 지정" }
@Column(nullable = false)
private UUID accountId;
```

## 자동 수정

경고만 출력. 연관관계 변경은 쿼리 전체에 영향을 주므로 수동 판단 필요.

## Gotchas

- ID 참조 패턴이 반드시 나쁜 것은 아님. MSA/모듈 경계에서는 의도적으로 사용
- 모놀리스 단일 DB에서는 JPA 연관관계가 FK 무결성을 보장하므로 더 안전
- Task AC에서 ID 참조를 지정했다면 override로 기록하고 PASS 처리
- v0.4.2에서 달성, v0.4.3에서 퇴행한 항목

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
