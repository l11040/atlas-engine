---
name: reserved-word-escape
description: >
  DB 예약어를 테이블명으로 사용하는 엔티티에 백틱 이스케이프가 적용되었는지 검증한다.
  @Table(name = "`Grant`") 형태로 이스케이프하지 않으면 DDL/DML 실행 시 SQL 오류 발생.
  Use this skill when: 엔티티 클래스가 생성되거나 수정될 때.
---

# reserved-word-escape — DB 예약어 테이블명 이스케이프 검증

## 검증 대상
`@Entity` 어노테이션이 있는 모든 `.java` 파일

## 예약어 목록

MySQL/PostgreSQL 공통 예약어 중 테이블명으로 사용될 가능성이 있는 것:

```
Grant, Order, User, Group, Table, Index, Key, Check, Column,
Constraint, Database, Default, Delete, Drop, Foreign, Function,
Insert, Join, Level, Lock, Match, Option, Primary, Range,
Release, Replace, Return, Role, Schema, Select, Session,
Status, Trigger, Update, Value, View
```

## 검증 규칙

1. `@Table(name = "...")` 값이 예약어 목록에 해당하면 백틱 이스케이프 필수
2. 이스케이프 형식: `@Table(name = "\`Grant\`")` (백틱으로 감싸기)
3. 마이그레이션 SQL에서도 해당 테이블명에 백틱 사용 확인

## 검증 방법

```java
// PASS — 백틱 이스케이프
@Entity
@Table(name = "`Grant`")
public class Grant extends BaseEntity { }

// PASS — 예약어가 아닌 테이블명
@Entity
@Table(name = "PointAccount")
public class PointAccount extends BaseEntity { }

// FAIL — 예약어인데 이스케이프 없음
@Entity
@Table(name = "Grant")
public class Grant extends BaseEntity { }

// FAIL — @Table 자체가 없고 클래스명이 예약어
@Entity
public class Order extends BaseEntity { }
```

## 자동 수정

1. `@Table(name = "Grant")` → `@Table(name = "\`Grant\`")` 변환
2. `@Table` 없으면 `@Table(name = "\`{ClassName}\`")` 추가
3. 관련 마이그레이션 SQL의 CREATE TABLE/ALTER TABLE에도 백틱 추가 경고

## Gotchas

- 대소문자 무관하게 예약어 판정 (Grant, grant, GRANT 모두 해당)
- JPA 기본 전략은 클래스명을 테이블명으로 사용 → `@Table` 없으면 클래스명 확인 필요
- Hibernate의 `hibernate.globally_quoted_identifiers=true` 설정이 있으면 자동 이스케이프 → SKIP 가능

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
