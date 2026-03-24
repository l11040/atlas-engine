---
name: learn
description: >
  프로젝트 환경(스택, 빌드 명령어, 린트 설정)을 감지하고 domain_lint 선언적 룰을 생성한다.
  컨벤션 검증은 convention-check 스킬이 담당하므로, learn은 환경 감지와 기계적 룰 생성에 집중한다.
---

# /learn — 프로젝트 환경 감지 + domain_lint 생성

## 역할 분담

| 항목 | learn (이 스킬) | convention-check |
|------|----------------|-----------------|
| 스택 감지 (language, framework, build) | **담당** | — |
| 빌드/테스트/린트 명령어 (commands) | **담당** | — |
| 스타일 규칙 (indent, braces, imports) | **담당** | — |
| 린트 설정 요약 (lint_rules) | **담당** | — |
| domain_lint 선언적 룰 (기계적 검증) | **담당** | — |
| production_rules (레드팀 참조) | **담당** | — |
| 엔티티 컨벤션 (BaseEntity, @Version, SoftDelete) | — | **담당** (개별 스킬) |
| API 컨벤션 (응답 래핑, Swagger, GlobalException) | — | **담당** (개별 스킬) |
| 서비스 컨벤션 (트랜잭션, 인터페이스) | — | **담당** (개별 스킬) |
| 프론트엔드 컨벤션 (Orval, Zustand, shadcn) | — | **담당** (개별 스킬) |
| 절대 규칙 (Redis 금지, Caffeine only) | — | **담당** (개별 스킬) |

**원칙**: learn은 **프로젝트마다 다른 것**(환경, 명령어, 구조)을 감지한다. convention-check는 **프로젝트 수준 결정**(컨벤션)을 검증한다.

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
- 주요 내용(stack, commands)을 출력하고 **즉시 종료**한다

### 2. 설정 파일 스캔 → stack, commands, style, lint_rules

`PROJECT_ROOT`에서 설정 파일을 탐색하여 추출한다:

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

### 3. 코드 샘플링 → naming, style

주요 디렉토리에서 3~5개 파일을 샘플링하여 **네이밍 패턴과 스타일**만 추출한다.

**추출하지 않는 것** (convention-check가 담당):
- ~~BaseEntity 상속 여부~~ → `backend/entity/base-entity`
- ~~@Version 사용 여부~~ → `backend/entity/optimistic-lock`
- ~~@Transactional 패턴~~ → `backend/service/transaction-default`
- ~~응답 래핑 패턴~~ → `backend/api/response-wrapper`

### 4. domain_lint 규칙 생성

기존 코드를 스캔하여 validate.sh가 **기계적으로 실행**하는 선언적 룰을 생성한다.

이 규칙들은 convention-check의 의미론적 검증과 다르게 **grep/패턴매칭 기반**이다.

#### 4.1. 동시성 (concurrency)

mutable 금액/잔액 필드를 가진 엔티티에서 동시성 제어 메커니즘을 확인한다.

```json
{
  "id": "CONC-1",
  "type": "require_guard",
  "file_glob": "*.java",
  "trigger": "@Entity",
  "condition": "BigDecimal",
  "guard": "@Version",
  "exclude": "@Immutable|append-only",
  "message": "@Version 누락 (mutable BigDecimal 엔티티)",
  "severity": "high"
}
```

#### 4.2. 상태 전이 (state_machines)

Enum 기반 상태 전이 메서드에 guard 조건이 있는지 확인한다.

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
  "message": "상태 전이 메서드에 guard 조건 없음",
  "severity": "high"
}
```

#### 4.3. 예약어 (reserved_words)

DB 테이블명이 예약어와 충돌하지 않는지 확인한다.

```json
{
  "id": "RESERVED-1",
  "type": "forbidden_name",
  "file_glob": "*.java",
  "trigger": "@Table",
  "name_attr": "name",
  "forbidden": ["grant", "order", "group", "key", "index", "range", "check"],
  "message": "DB 예약어와 충돌",
  "severity": "high"
}
```

#### 4.4. 배치/비동기 (batch)

배치 처리 설정의 장애 허용 패턴을 확인한다.

#### 4.5. 감사 추적 (audit)

이력/원장 테이블 패턴에서 감사 필드 존재를 확인한다.

### 5. production_rules 생성

레드팀 체크리스트에서 참조하는 **사람이 읽는** 규칙을 생성한다.
카테고리: concurrency, state_machines, reserved_words, batch, audit

### 6. conventions.json 생성

`schemas/learn/conventions.schema.json`을 참조하여 저장한다.

**conventions.json에 포함되는 것**:
- `stack` — 언어, 프레임워크, 빌드 도구
- `commands` — 빌드/테스트/린트 명령어
- `naming` — 네이밍 패턴 (파일/클래스/메서드)
- `style` — 코드 스타일 (들여쓰기, 중괄호, import)
- `annotations` — 레이어별 어노테이션 목록
- `patterns` — 프로젝트 디자인 패턴
- `forbidden` / `required` — 금지/필수 목록 (간략 버전, 상세는 convention-check)
- `lint_rules` — 린트 설정 요약
- `production_rules` — 레드팀용 도메인 규칙
- `domain_lint` — validate.sh용 선언적 규칙

**conventions.json에 더 이상 포함하지 않는 것**:
- ~~엔티티 설계 패턴 상세~~ (convention-check `backend/entity/`)
- ~~API 응답 형식 상세~~ (convention-check `backend/api/`)
- ~~트랜잭션 관리 상세~~ (convention-check `backend/service/`)
- ~~프론트엔드 패턴 상세~~ (convention-check `frontend/`)

### 7. 증거 기록

```json
{
  "type": "step_done",
  "step": "learn",
  "status": "done",
  "summary": {
    "stack": "java/spring-boot",
    "commands_detected": 2,
    "domain_lint_count": 4,
    "production_rules_count": 8
  },
  "timestamp": "ISO-8601"
}
```

### 8. 결과 출력

1. 감지된 스택 요약
2. 실행 가능한 commands
3. domain_lint 룰 요약
4. production_rules 요약
5. conventions.json 경로
