---
name: audit-columns
description: >
  새 테이블 DDL에 created_at, updated_at Audit 컬럼이 존재하는지 검증한다.
  BaseEntity의 @CreatedDate, @LastModifiedDate와 대응.
  Use this skill when: CREATE TABLE 마이그레이션이 생성될 때.
---

# audit-columns — Audit 컬럼 검증

## 검증 대상
`CREATE TABLE`이 포함된 SQL 파일

## 검증 규칙

1. `created_at DATETIME NOT NULL` 컬럼 존재
2. `updated_at DATETIME NOT NULL` 컬럼 존재

## 자동 수정

누락된 컬럼 추가.

## 증거 포맷

```json
{
  "id": "MIG-004",
  "category": "backend/migration",
  "rule": "Audit 컬럼",
  "status": "PASS|FAIL",
  "missing_columns": []
}
```
