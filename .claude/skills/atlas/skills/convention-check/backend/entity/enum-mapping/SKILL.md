---
name: enum-mapping
description: >
  JPA 엔티티의 Enum 필드에 @Enumerated(EnumType.STRING)이 적용되었는지 검증한다.
  ORDINAL 매핑은 Enum 순서 변경 시 데이터 오염을 유발하므로 금지.
  Use this skill when: 엔티티 클래스에 Enum 타입 필드가 포함될 때.
---

# enum-mapping — Enum 매핑 방식 검증

## 검증 대상
`*Entity.java` 파일 내 Enum 타입 필드

## 검증 규칙

1. 모든 Enum 타입 필드에 `@Enumerated(EnumType.STRING)` 필수
2. `@Enumerated(EnumType.ORDINAL)` 또는 `@Enumerated` (기본값=ORDINAL) 사용 금지
3. `@Enumerated` 없이 Enum 필드 선언 금지

## 검증 방법

```java
// PASS
@Enumerated(EnumType.STRING)
private PointStatus status;

// FAIL — ORDINAL (명시적)
@Enumerated(EnumType.ORDINAL)
private PointStatus status;

// FAIL — 어노테이션 누락 (기본값이 ORDINAL)
private PointStatus status;
```

## 자동 수정

1. Enum 필드에 `@Enumerated(EnumType.STRING)` 추가
2. ORDINAL → STRING 변경
3. import 추가: `import jakarta.persistence.EnumType;`, `import jakarta.persistence.Enumerated;`

## Gotchas

- Enum에 `@Enumerated` 없으면 JPA 기본값은 ORDINAL — 이것이 가장 흔한 실수
- DDL에서 해당 컬럼은 `VARCHAR` 타입이어야 STRING 매핑과 일치

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
