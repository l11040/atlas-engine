---
name: learn
description: >
  프로젝트 코드 컨벤션을 분석하여 conventions.json을 생성한다.
  설정 파일, 기존 코드, CLAUDE.md에서 네이밍·스타일·패턴 규칙을 추출한다.
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

1. 빌드 래퍼 위치 확인 (`gradlew`, `mvnw` 등)
2. 모듈 구조 파악 (멀티 모듈이면 타겟 식별)
3. `package.json` scripts 확인 (`build`, `test`, `lint`, `typecheck`)
4. `Makefile` 타겟 확인

```json
{
  "commands": {
    "build": "cd server && ./gradlew :core:compileJava :fo:compileJava",
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

### 4. CLAUDE.md 참조

`PROJECT_ROOT/CLAUDE.md`가 있으면 컨벤션 관련 지시를 추출하여 반영한다.

### 5. conventions.json 생성

`schemas/learn/conventions.schema.json`을 읽어서 필드 구조를 확인한 뒤 저장한다.

**작성 원칙:**
- 각 항목은 **한 줄로 명확하게** (긴 설명 금지)
- `forbidden`/`required`는 배열 — 프롬프트에 바로 주입 가능한 수준
- 요약만 저장 (설정 파일 전체를 복사하지 않음)

### 6. 증거 기록

conventions.json 생성 후 증거를 기록한다:

```json
// ${RUN_DIR}/evidence/learn/done.json (RUN_DIR이 있는 경우)
// 또는 conventions.json 존재 자체가 learn 완료 증거
{
  "type": "step_done",
  "step": "learn",
  "status": "done",
  "summary": {"stack": "java/spring-boot", "rules_count": 15},
  "timestamp": "ISO-8601"
}
```

### 7. 결과 출력

1. 감지된 스택 요약 (language, framework, build)
2. 주요 컨벤션 요약 (naming, forbidden/required 핵심)
3. conventions.json 경로
