---
name: unique-index
description: >
  DDL 마이그레이션에서 비즈니스 고유 필드에 UNIQUE 제약이 INDEX가 아닌 UNIQUE INDEX로 정의되었는지 검증한다.
  일반 INDEX는 중복을 허용하므로 데이터 무결성을 보장하지 않는다.
  Use this skill when: Flyway 마이그레이션 파일(V*__*.sql)이 생성될 때.
---

# unique-index — DDL UNIQUE 제약 검증

## 검증 대상
`V*__*.sql` 마이그레이션 파일

## 검증 규칙

1. 비즈니스 고유 필드(member_id, idempotency_key, email 등)에 `UNIQUE INDEX` 또는 `UNIQUE` 제약 필수
2. `CREATE INDEX` (non-unique)만 있고 `UNIQUE`가 없으면 FAIL
3. 1:1 관계 FK 컬럼에도 UNIQUE 필수

## 검증 방법

```sql
-- PASS
CREATE UNIQUE INDEX uk_point_account_member ON point_account(member_id);

-- PASS
ALTER TABLE point_account ADD CONSTRAINT uk_member UNIQUE (member_id);

-- FAIL — 일반 INDEX (중복 허용)
CREATE INDEX idx_point_account_member ON point_account(member_id);

-- FAIL — idempotency_key에 UNIQUE 없음
CREATE TABLE grant_table (
    idempotency_key VARCHAR(255),
    -- UNIQUE 제약 없음
);
```

## 자동 수정

1. `CREATE INDEX` → `CREATE UNIQUE INDEX` 변환
2. 테이블 정의에 `UNIQUE` 제약 추가

## Gotchas

- `idempotency_key`는 반드시 UNIQUE (멱등성 보장의 물리적 근거)
- `member_id`가 계좌 테이블에서 UNIQUE가 아니면 1인 복수 계좌 가능 (비즈니스 버그)
- 엔티티 `@Column(unique=true)`와 DDL 양쪽 다 일치해야 함

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
