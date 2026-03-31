---
name: flyway-naming
description: >
  Flyway 마이그레이션 파일명이 프로젝트의 버전 형식에 맞는지 검증한다. (적응형)
  V{YYYYMMDD}{HHmmss}__ 또는 V{번호}__ 등 프로젝트마다 버전 형식이 다르다.
  기존 마이그레이션 파일을 스캔하여 버전 형식을 자동 감지한다.
  Use this skill when: SQL 마이그레이션 파일(V*__.sql)이 생성될 때.
---

# flyway-naming — Flyway 파일명 검증 (적응형)

## 검증 대상
`db/migration/` 하위 SQL 파일

## 버전 형식 감지 (실행 전 필수)

```
1. 기존 db/migration/ 하위 SQL 파일을 스캔한다
2. 버전 형식 판정:
   a. V{14자리 숫자}__ 패턴 (V20260324120000__) → timestamp 형식
   b. V{1~4자리 숫자}__ 패턴 (V1__, V20__) → sequential number 형식
   c. V{8자리}.{3자리}__ 패턴 (V20260324.001__) → date+seq 형식
   d. 혼용 → 최신 파일의 패턴을 우선
3. 설명 부분의 케이스도 감지:
   a. snake_case (create_point_account)
   b. kebab-case (create-point-account)
   c. PascalCase (Create_Point_Tables)
4. 감지된 형식으로 검증 실행
```

## 검증 규칙

### 공통 규칙

1. 파일명이 `V{version}__{description}.sql` 기본 패턴을 따라야 한다
2. 버전 번호가 기존 마이그레이션과 중복되지 않아야 한다
3. 설명 부분은 감지된 케이스를 따라야 한다

### timestamp 형식

```
// PASS
V20260324120000__create-point-account.sql

// FAIL
V1__init.sql
```

### sequential number 형식

```
// PASS
V1__init.sql
V20__Create_Point_Tables.sql

// FAIL
V20260324120000__create-point-account.sql
```

## 자동 수정

파일명 변경 안내만 출력.

## Gotchas

- 기존 파일이 없으면 (최초 마이그레이션) 감지 불가 → conventions.json 참조 또는 SKIP
- 동일 프로젝트에서 형식을 바꾸면 Flyway가 정상 작동하지만 가독성이 떨어짐
- 버전 충돌은 Flyway 실행 시 에러로 발견되므로 검증에서는 WARN 처리

## 증거

개별 스킬은 증거를 직접 작성하지 않는다. 검증 결과(id, rule, status, evidence, fix_hint)를 오케스트레이터에 반환하면, `record-convention-evidence.sh`가 `convention-check.schema.json` 표준 포맷으로 통합 기록한다.
