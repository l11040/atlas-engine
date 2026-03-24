---
name: flyway-naming
description: >
  Flyway 마이그레이션 파일명이 V{YYYYMMDD}{HHmmss}__{설명}.sql 형식인지 검증한다.
  Use this skill when: SQL 마이그레이션 파일(V*__.sql)이 생성될 때.
---

# flyway-naming — Flyway 파일명 검증

## 검증 대상
`db/migration/` 하위 SQL 파일

## 검증 규칙

1. 파일명 패턴: `V{YYYYMMDD}{HHmmss}__{kebab-case-설명}.sql`
2. 버전 번호가 기존 마이그레이션과 중복되지 않아야 함
3. 설명은 snake_case 또는 kebab-case

## 검증 방법

```
// PASS
V20260324120000__create-point-account.sql
V20260324120100__add-version-column-to-point.sql

// FAIL — 형식 불일치
create_point.sql
V1__init.sql
```

## 자동 수정

파일명 변경 안내만 출력.

## 증거 포맷

```json
{
  "id": "MIG-001",
  "category": "backend/migration",
  "rule": "Flyway 파일명",
  "status": "PASS|FAIL",
  "evidence": "네이밍 규칙 준수|형식 불일치"
}
```
