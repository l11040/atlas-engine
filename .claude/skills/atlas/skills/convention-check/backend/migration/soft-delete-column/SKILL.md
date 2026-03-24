---
name: soft-delete-column
description: >
  새 테이블 DDL에 deleted_at 컬럼이 존재하는지 검증한다.
  Soft Delete 엔티티 패턴과 대응하는 DB 컬럼.
  Use this skill when: CREATE TABLE 마이그레이션이 생성될 때.
---

# soft-delete-column — deleted_at 컬럼 검증

## 검증 대상
`CREATE TABLE`이 포함된 SQL 파일

## 검증 규칙

1. `deleted_at DATETIME NULL` 컬럼 존재
2. `created_at DATETIME NOT NULL` 컬럼 존재
3. `updated_at DATETIME NOT NULL` 컬럼 존재

## 검증 방법

```sql
-- PASS
CREATE TABLE point_account (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    -- ... 비즈니스 컬럼
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    deleted_at DATETIME NULL,
    version BIGINT NOT NULL DEFAULT 0
);

-- FAIL — deleted_at 누락
CREATE TABLE point_account (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);
```

## 자동 수정

누락된 컬럼을 DDL에 추가.

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
