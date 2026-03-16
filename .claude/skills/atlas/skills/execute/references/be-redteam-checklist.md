# 레드팀 체크리스트

레이어별 병렬 에이전트가 사용하는 검토 기준. **스택에 무관한 범용 구조**이며, 구체적인 검토 항목은 `conventions.json`의 `production_rules`에서 읽는다.

## 증거 규칙 (필수)

모든 체크 항목은 `line_ref`(파일명:라인번호)를 **반드시** 포함해야 한다.

- **pass**: 조건이 충족된 코드의 위치 (예: `Account.java:23`, `user.model.ts:15`)
- **fail**: 위반이 발견된 코드의 위치
- **skip**: 해당 레이어에 검토 대상이 없으면 `N/A`
- `line_ref`가 없는 체크는 **증거 불충분**으로 간주한다

### 증거 JSON 형식

```json
{
  "id": "CONC-1",
  "item": "낙관적 잠금 검증",
  "result": "fail",
  "severity": "high",
  "line_ref": "Account.java:18",
  "detail": "mutable 금액 필드가 있으나 동시성 제어 없음"
}
```

## 레이어 구성

레이어는 프로젝트 스택에 따라 자유롭게 정의한다. `conventions.json`의 `production_rules` 카테고리를 기반으로 에이전트를 구성한다.

**에이전트 실행 규칙:**
1. Task의 files에 해당 레이어 파일이 **없으면** 해당 에이전트는 스킵
2. 각 에이전트는 `conventions.json` + task의 ac 기준으로 검토
3. 에이전트는 **수정 지시만 반환** (직접 수정하지 않음)
4. 모든 에이전트 완료 후 피드백을 모아서 한 번에 반영

### 레이어 예시

| 스택 | 레이어 예시 |
|------|------------|
| Java/Spring | domain, schema, repository, service, batch |
| TypeScript/Next.js | model, schema, api, component, middleware |
| Python/Django | model, migration, view, serializer, task |
| Go/gRPC | domain, proto, repository, handler, worker |

---

## 범용 검토 카테고리

### 1. 동시성 (Concurrency)

`production_rules.concurrency`에서 구체적 규칙을 읽는다.

**공통 원칙:**
- [ ] **CONC-1** — mutable 금액/잔액/수량 필드에 동시성 제어가 있는가
  → 스택별: `@Version`(JPA), `version`(Prisma), `updated_at` check(Django), `sync.Mutex`(Go)
  → line_ref: 동시성 제어 코드 위치 / 없으면 필드 선언부
- [ ] **CONC-2** — 잔액/재고 갱신 쿼리가 원자적인가 (SELECT FOR UPDATE, atomic update)
  → line_ref: 갱신 로직 위치

### 2. 상태 전이 (State Management)

`production_rules.state_machines`에서 구체적 규칙을 읽는다.

**공통 원칙:**
- [ ] **STATE-1** — 상태 전이 메서드에 현재 상태 사전조건 검증이 있는가
  → 스택별: `if` + `throw`(Java), `if` + `raise`(Python), `assert`(Go)
  → line_ref: guard 조건문 위치 / 없으면 메서드 선언부
- [ ] **STATE-2** — 허용되지 않는 상태 전이 조합이 차단되는가
  → line_ref: 차단 로직 위치

### 3. 데이터 무결성 (Data Integrity)

**공통 원칙:**
- [ ] **DOM-1** — 엔티티/모델 필드가 AC 요구사항을 모두 충족하는가
  → line_ref: 필드 선언부
- [ ] **DOM-2** — 연관관계/참조가 올바른가 (FK, cascade, orphan removal)
  → line_ref: 관계 정의 위치
- [ ] **DOM-3** — Enum/상수 값이 도메인 요구사항을 빠짐없이 반영하는가
  → line_ref: Enum/상수 선언부

### 4. 스키마/마이그레이션 (Schema)

`production_rules.reserved_words`에서 구체적 규칙을 읽는다.

**공통 원칙:**
- [ ] **RESERVED-1** — 테이블/컬렉션명이 DB 예약어와 충돌하지 않는가
  → line_ref: 테이블 정의 위치
- [ ] **SCH-1** — FK/참조 무결성 제약이 정의되었는가
  → line_ref: 제약 정의 위치
- [ ] **SCH-2** — NOT NULL/required 제약이 적절한가
  → line_ref: 컬럼/필드 정의 위치
- [ ] **SCH-3** — 인덱스가 쿼리 패턴에 맞게 설정되었는가
  → line_ref: 인덱스 정의 위치
- [ ] **SCH-4** — 컬럼 타입/길이가 적절한가 (precision, varchar 등)
  → line_ref: 타입 정의 위치
- [ ] **SCH-5** — Repository가 `Optional`/단일 객체로 반환하는 컬럼에 UNIQUE 제약이 있는가
  → `findByX()` → `Optional<T>` 이면 X 컬럼은 비즈니스 유일성을 전제. DDL + 엔티티 양쪽에 UNIQUE 필수
  → line_ref: Repository 메서드 선언 위치 + DDL/엔티티 컬럼 정의 위치

### 5. 비즈니스 로직 (Service/Handler)

`production_rules.audit`에서 감사 규칙을 읽는다.

**공통 원칙:**
- [ ] **AUDIT-1** — 이력/원장 레코드에 감사 필드가 포함되는가 (변경 후 잔액, 조작자 ID 등)
  → line_ref: 이력 생성 코드 위치
- [ ] **AUDIT-2** — 감사 값이 올바른 시점에 계산되는가 (변경 전 vs 변경 후)
  → line_ref: 계산 코드 위치
- [ ] **SVC-1** — 트랜잭션 경계가 적절한가 (읽기 전용 분리)
  → line_ref: 트랜잭션 설정 위치
- [ ] **SVC-2** — 입력 검증이 충분한가
  → line_ref: 검증 로직 위치
- [ ] **SVC-3** — DTO ↔ 엔티티 변환이 올바른가
  → line_ref: 변환 코드 위치
- [ ] **RACE-1** — 멱등성 키 충돌 시 적절히 처리되는가
  → line_ref: 예외 처리 위치

### 6. 배치/비동기 (Batch/Worker)

`production_rules.batch`에서 구체적 규칙을 읽는다.

**공통 원칙:**
- [ ] **BATCH-1** — 시점 의존 값(now, today)이 실행 시점에 고정되는가
  → 스택별: `@StepScope`(Spring Batch), closure capture(Node.js), `time.Now()`(Go)
  → line_ref: 시점 값 사용 위치
- [ ] **BATCH-2** — 에러 스킵 범위가 구체적 예외로 한정되는가
  → line_ref: 에러 처리 설정 위치
- [ ] **BATCH-3** — Reader에서 LAZY 연관 엔티티를 Processor/Writer에서 접근할 때 fetch join이 있는가
  → Reader 쿼리에 `fetchJoin`/`JOIN FETCH`/`@EntityGraph` 없이 Processor에서 `item.getX()` 호출 시 N+1 확정
  → 스택별: `.leftJoin(x).fetchJoin()`(QueryDSL), `JOIN FETCH`(JPQL), `@EntityGraph`(Spring Data), `.prefetch_related()`(Django), `.Preload()`(GORM)
  → line_ref: Reader 쿼리 위치 + Processor 내 연관 접근 위치
- [ ] **BATCH-4** — 스케줄러에 타임존이 명시되어 있는가
  → line_ref: 스케줄 정의 위치

### 7. Convention Override 검증

Task에 `overrides`가 있을 때 적용한다. overrides가 없으면 전체 스킵.

- [ ] **CONV-1** — override 결정(`decision: "ac"`)이 실제 코드에 반영되었는가
  → override에서 `ac_requires: "UUID BINARY(16)"`인데 코드가 Long이면 FAIL
  → line_ref: 해당 필드/설정 위치
- [ ] **CONV-2** — override 없는 항목이 conventions.json을 따르는가
  → overrides에 명시되지 않은 conventions 규칙이 코드에서 위반되면 FAIL
  → line_ref: 위반 코드 위치
- [ ] **CONV-3** — override 근거의 출처 티켓이 source.json에 실존하는가
  → override.reason에 언급된 티켓 키가 source.json에 없으면 FAIL
  → line_ref: N/A (task 파일 참조)

### 8. 미완성 설계 감지

모든 레이어 검토 완료 후, 다음을 추가로 확인한다:

- [ ] **INCOMPLETE-1** — null/undefined 반환이나 빈 구현(TODO, NotImplemented)에 대응하는 코드가 존재하는가
  → line_ref: 미완성 코드 위치 + 대응 코드 위치 (없으면 FAIL + 구현 필요 범위 명시)

---

## conventions.json 연동

1. `production_rules`의 각 카테고리는 위 체크리스트의 해당 섹션에 **추가 검토 항목**으로 반영한다
2. 규칙 ID는 카테고리 약어 + 번호 (예: CONC-1, STATE-1, BATCH-1)
3. `domain_lint`에 정의된 기계적 룰과 중복되는 항목은 validate.sh가 이미 검증했으므로 레드팀에서는 **edge case 위주**로 검토한다
