---
name: protected-constructor
description: >
  JPA 엔티티에 protected 기본 생성자가 존재하는지 검증한다.
  JPA 프록시 생성을 위해 필요하며, public이 아닌 protected로 외부 직접 생성을 차단한다.
  Use this skill when: 엔티티 클래스(*Entity.java)가 생성되거나 수정될 때.
---

# protected-constructor — protected 기본 생성자 검증

## 검증 대상
`*Entity.java` 파일

## 검증 규칙

1. `protected` 접근 제어자의 no-arg 생성자가 존재해야 한다
2. `public` no-arg 생성자는 FAIL (외부 직접 인스턴스화 방지)
3. Lombok `@NoArgsConstructor(access = AccessLevel.PROTECTED)` 도 PASS

## 검증 방법

```java
// PASS — 직접 선언
protected PointEntity() {}

// PASS — Lombok
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PointEntity extends BaseEntity { }

// FAIL — public 생성자
public PointEntity() {}

// FAIL — 생성자 없음 (컴파일러 기본값은 public)
```

## 자동 수정

`@NoArgsConstructor(access = AccessLevel.PROTECTED)` 클래스 어노테이션 추가 (Lombok 사용 프로젝트)

## Gotchas

- 다른 생성자가 있으면 컴파일러가 기본 생성자를 자동 생성하지 않으므로 반드시 명시
- Lombok `@NoArgsConstructor`는 기본적으로 `public` — `access = AccessLevel.PROTECTED` 필수

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
