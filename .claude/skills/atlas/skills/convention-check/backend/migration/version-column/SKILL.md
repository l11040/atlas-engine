---
name: version-column
description: >
  새 테이블 DDL에 version 컬럼(BIGINT NOT NULL DEFAULT 0)이 존재하는지 검증한다.
  @Version 낙관적 락 엔티티 패턴과 대응하는 DB 컬럼.
  Use this skill when: CREATE TABLE 마이그레이션이 생성될 때.
---

# version-column — version 컬럼 검증

## 검증 대상
`CREATE TABLE`이 포함된 SQL 파일

## 검증 규칙

1. `version BIGINT NOT NULL DEFAULT 0` 컬럼 존재

## 검증 방법

```sql
-- PASS
CREATE TABLE point_account (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    version BIGINT NOT NULL DEFAULT 0,
    ...
);

-- FAIL — version 컬럼 누락
CREATE TABLE point_account (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ...
);
```

## 자동 수정

`version BIGINT NOT NULL DEFAULT 0` 컬럼 추가.

## Gotchas

- DEFAULT 0은 @Version의 초기값과 일치해야 한다
- ALTER TABLE로 추가할 때도 `DEFAULT 0` 필수 (기존 행의 version 초기화)

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
