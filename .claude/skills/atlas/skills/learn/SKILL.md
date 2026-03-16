---
name: learn
description: >
  프로젝트 코드 컨벤션을 분석하여 conventions.json을 생성한다.
  설정 파일, 기존 코드, CLAUDE.md에서 네이밍·스타일·패턴 규칙을 추출한다.
  production_rules와 domain_lint를 통해 반복 결함을 기계적으로 방지한다.
---

# /learn — 프로젝트 컨벤션 분석

## 목적

대상 프로젝트의 코드 컨벤션을 분석하여 `.automation/conventions.json`을 생성한다.

## 옵션

- 옵션 없음 → conventions.json이 없으면 생성, 있으면 로드 후 종료
- `--refresh-conventions` → 기존 파일 무시하고 강제 재생성

## 실행 흐름

### 0. 사전 확인

1. `source scripts/common.sh && load_env`로 환경 로드
2. `PROJECT_ROOT` 경로 확인
3. `.automation/` 디렉토리가 없으면 `ensure_automation_dir` 실행

### 1. 기존 conventions.json 확인

`PROJECT_ROOT/.automation/conventions.json`이 존재하고 `--refresh-conventions`가 없으면:
- 주요 내용(stack, naming)을 출력하고 **즉시 종료**한다

### 2. 설정 파일 스캔

`PROJECT_ROOT`에서 설정 파일을 탐색하여 명시적 규칙을 추출한다:

| 카테고리 | 탐색 대상 |
|----------|-----------|
| 빌드/패키지 | `package.json`, `pom.xml`, `build.gradle(.kts)`, `Cargo.toml`, `go.mod`, `pyproject.toml` |
| 린트/포맷 | `.eslintrc*`, `.prettierrc*`, `checkstyle.xml`, `.editorconfig`, `biome.json` |
| 타입/컴파일 | `tsconfig*.json`, `vite.config.*`, `next.config.*` |
| 테스트 | `jest.config.*`, `vitest.config.*`, `pytest.ini` |

#### 실행 커맨드 탐색 (`commands`)

빌드 도구와 모듈 구조를 파악하여 **실제 실행 가능한 커맨드**를 기록한다:

1. 빌드 래퍼 위치 확인 (`gradlew`, `mvnw`, `Makefile` 등)
2. 모듈 구조 파악 (멀티 모듈이면 타겟 식별)
3. `package.json` scripts 확인 (`build`, `test`, `lint`, `typecheck`)
4. `Makefile` 타겟 확인

```json
{
  "commands": {
    "build": "cd server && ./gradlew :core:compileJava",
    "test": "cd server && ./gradlew test",
    "lint": null,
    "typecheck": null
  }
}
```

- 커맨드가 없는 항목은 `null`로 기록한다
- 모든 커맨드는 `PROJECT_ROOT`에서 실행된다고 가정한다

### 3. 기존 코드 분석

주요 디렉토리에서 3~5개 파일을 샘플링하여 암묵적 패턴을 추출한다:
- naming, style, annotations, patterns, forbidden, required

### 4. Production Rules 분석

기존 코드를 스캔하여 **도메인 안전 규칙**을 추출한다. 이 규칙들은 두 가지 용도로 사용된다:
1. `production_rules` — 레드팀 체크리스트에서 **사람이 읽는** 검토 기준
2. `domain_lint` — validate.sh에서 **기계적으로 실행**하는 선언적 룰

#### 4.1. 범용 분석 절차

**스택을 먼저 감지**한 뒤, 해당 스택에서 반복적으로 발생하는 결함 패턴을 탐색한다.

| 단계 | 설명 |
|------|------|
| 1. 스택 감지 | `stack.language`, `stack.framework`에서 기술 스택 파악 |
| 2. 패턴 매칭 | 아래 카테고리별로 프로젝트 코드에서 해당 패턴 존재 여부 탐색 |
| 3. 규칙 생성 | 발견된 패턴에 대해 `production_rules` (문자열)과 `domain_lint` (선언적 룰) 생성 |
| 4. 기본 규칙 | 코드에 패턴이 없어도 스택 특성상 필요한 규칙은 기본 생성 |

#### 4.2. 동시성 (concurrency)

mutable 금액/잔액/수량 필드를 가진 데이터 모델을 찾고, 동시성 제어 메커니즘을 확인한다.

| 스택 | 탐색 대상 | 동시성 제어 패턴 |
|------|----------|----------------|
| Java/JPA | `@Entity` + `BigDecimal` | `@Version`, `@Lock(PESSIMISTIC_WRITE)` |
| Django | `models.Model` + `DecimalField` | `F()` expression, `select_for_update()` |
| TypeScript/Prisma | `model` + `Decimal` | `@@version`, optimistic lock middleware |
| Go/GORM | `type.*struct` + `decimal.Decimal` | `gorm:"version"`, `sync.Mutex` |

**domain_lint 룰 생성 예시:**
```json
{
  "id": "CONC-1",
  "type": "require_guard",
  "file_glob": "*.java",
  "trigger": "@Entity",
  "condition": "BigDecimal",
  "guard": "@Version",
  "exclude": "@Immutable|append-only|불변|immutable",
  "message": "@Version 누락 (mutable BigDecimal 엔티티)",
  "severity": "high"
}
```

#### 4.3. 상태 전이 (state_machines)

Enum/상수 기반 상태 필드가 있는 모델의 상태 전이 메서드를 스캔한다.

| 스택 | 탐색 대상 | guard 패턴 |
|------|----------|-----------|
| Java | `@Enumerated` + `activate()`/`expire()` 등 | `if` + `throw` |
| TypeScript | `enum Status` + `transitionTo()` 등 | `if` + `throw new` |
| Python | `TextChoices`/`IntegerChoices` + `transition_*()` | `if` + `raise` |
| Go | `type.*Status` + `func.*Activate()` 등 | `if` + `return.*err` |

**domain_lint 룰 생성 예시 (C-family 언어만):**
```json
{
  "id": "STATE-1",
  "type": "method_guard",
  "file_glob": "*.java",
  "trigger": "@Entity",
  "prerequisite": "@Enumerated",
  "method_pattern": "activate|expire|revoke|spend|confirm|cancel|complete|fail",
  "guard_pattern": "if\\s*\\(|throw |IllegalStateException",
  "method_visibility": "public",
  "exclude": "@Immutable|append-only",
  "message": "상태 전이 메서드에 guard 조건 없음",
  "severity": "high"
}
```

**주의:** `method_guard` 타입은 brace 기반 블록 추적이므로 **C-family 언어**(Java, TypeScript, Go, C#)에만 적합하다. Python 등 indent 기반 언어는 `require_guard` 타입으로 파일 수준 검사를 권장한다.

#### 4.4. 예약어 (reserved_words)

DB 테이블/컬렉션명을 DB 엔진의 예약어 목록과 대조한다.

| 스택 | 탐색 대상 | 예약어 목록 소스 |
|------|----------|----------------|
| JPA | `@Table(name=...)` | MySQL, PostgreSQL dialect에 따라 결정 |
| Django | `class Meta: db_table` | PostgreSQL, MySQL, SQLite |
| TypeORM | `@Entity({ name: ... })` | 설정의 DB type에 따라 결정 |
| SQLAlchemy | `__tablename__` | `SQLALCHEMY_DATABASE_URI`에서 결정 |

**domain_lint 룰 생성 예시:**
```json
{
  "id": "RESERVED-1",
  "type": "forbidden_name",
  "file_glob": "*.java",
  "trigger": "@Table",
  "name_attr": "name",
  "forbidden": ["grant", "order", "group", "key", "index", "range", "check", "condition", "status", "rank", "role", "match"],
  "message": "DB 예약어와 충돌",
  "severity": "high"
}
```

#### 4.5. 배치/비동기 (batch)

배치 처리나 비동기 작업 설정을 스캔한다.

| 스택 | 탐색 대상 | 확인 항목 |
|------|----------|----------|
| Spring Batch | `@Bean` reader | `@StepScope`, `LocalDateTime.now()` |
| Spring Batch | Step 빌더 | `faultTolerant()`, `skipLimit()`, `retryLimit()` |
| Celery | `@task`/`@shared_task` | `bind=True`, `max_retries` |
| BullMQ | `new Queue()`/`Worker` | `concurrency`, `limiter` |
| Go worker | `func.*Worker` | context cancellation, graceful shutdown |

**production_rules.batch 추가 규칙:**
배치 처리 단계에 장애 허용(fault tolerance) 설정 권장 — 단일 아이템 실패가 전체 Job을 중단하지 않도록 스킵/재시도 정책을 명시한다.

#### 4.6. 감사 추적 (audit)

이력/원장 테이블 패턴을 스캔한다.

| 스택 | 탐색 대상 | 확인 항목 |
|------|----------|----------|
| 공통 | `*History`, `*Log`, `*Ledger`, `*Entry` | 감사 필드(변경 후 값, 조작자 ID) 존재 |
| 공통 | 잔액/재고 변경 서비스 | 감사 값 계산 시점 (변경 후여야 함) |
| ORM 감사 프레임워크 | 기존 모델의 감사 추적 어노테이션/데코레이터 사용 | 모델 정의 → 감사 대상 여부 명시 필수 |

**domain_lint 생성 지시:**
프로젝트에서 감사 추적 프레임워크를 사용하는 모델이 1개 이상 발견되면, `AUDIT-1` (`require_guard`) 룰을 생성하여 **모든 모델에 감사 대상 여부 선언을 강제**한다. trigger/guard/exclude는 감지된 스택에 맞게 구체화한다.

#### 4.7. 기존 코드에 패턴이 없는 경우

프로젝트에 해당 패턴이 아직 없더라도, **스택과 도메인 특성에 따라 기본 규칙을 생성**한다:

| 조건 | 기본 `production_rules` | 기본 `domain_lint` |
|------|------------------------|-------------------|
| ORM + mutable 금액 필드 | concurrency: 동시성 제어 필수 | `require_guard` 룰 |
| Enum 기반 상태 필드 | state_machines: guard 조건 필수 | `method_guard` 룰 (C-family) |
| RDBMS 사용 | reserved_words: 예약어 목록 | `forbidden_name` 룰 |
| 배치/비동기 프레임워크 | batch: 해당 프레임워크 규칙 | 해당 시 `require_guard` 룰 |
| ORM + 공통 부모 클래스 패턴 | base_entity: 상속 필수 | `require_guard` 룰 (BASE-1) |

**BASE-1 생성 시 주의:**
프로젝트에서 모든 모델이 공통 부모 클래스를 상속하는 패턴이 발견되면 `require_guard` 룰을 생성하되, **불변/append-only 모델은 예외**로 처리한다. exclude 조건에 이력/원장/이벤트성 모델 패턴을 포함한다.
`forbidden` 배열에 "공통 부모 클래스 미상속 금지"를 추가할 때도 **"(불변/이력 모델 제외)"**를 반드시 명시한다.

### 5. CLAUDE.md 참조

`PROJECT_ROOT/CLAUDE.md`가 있으면 컨벤션 관련 지시를 추출하여 반영한다.

### 6. conventions.json 생성

`schemas/learn/conventions.schema.json`을 읽어서 필드 구조를 확인한 뒤 저장한다.

**작성 원칙:**
- 각 항목은 **한 줄로 명확하게** (긴 설명 금지)
- `forbidden`/`required`는 배열 — 프롬프트에 바로 주입 가능한 수준
- `production_rules`의 각 카테고리는 프로젝트 스택에 따라 자유롭게 정의
- `domain_lint`의 각 룰은 **validate.sh가 기계적으로 실행할 수 있는 선언적 구조**
- 요약만 저장 (설정 파일 전체를 복사하지 않음)

### 7. 증거 기록

conventions.json 생성 후 증거를 기록한다:

```json
// ${RUN_DIR}/evidence/learn/done.json (RUN_DIR이 있는 경우)
// 또는 conventions.json 존재 자체가 learn 완료 증거
{
  "type": "step_done",
  "step": "learn",
  "status": "done",
  "summary": {"stack": "java/spring-boot", "rules_count": 15, "domain_lint_count": 4},
  "timestamp": "ISO-8601"
}
```

### 8. 결과 출력

1. 감지된 스택 요약 (language, framework, build)
2. 주요 컨벤션 요약 (naming, forbidden/required 핵심)
3. production rules 요약 (카테고리별 규칙 수)
4. domain_lint 요약 (룰 타입별 수: require_guard, forbidden_name, method_guard)
5. conventions.json 경로
