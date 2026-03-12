---
name: learn
description: >
  프로젝트 코드 컨벤션을 분석하여 conventions.json을 생성한다.
  설정 파일, 기존 코드, CLAUDE.md에서 네이밍·스타일·패턴 규칙을 추출한다.
disable-model-invocation: true
---

# /learn — 프로젝트 컨벤션 분석

## 목적

대상 프로젝트의 코드 컨벤션을 분석하여 `.automation/conventions.json`을 생성한다.

## 옵션

- 옵션 없음 → conventions.json이 없으면 생성, 있으면 로드 후 종료
- `--refresh-conventions` → 기존 파일 무시하고 강제 재생성

## 실행 흐름

### 0. 사전 확인

1. 스킬 루트(`${CLAUDE_SKILL_DIR}/.env`)에서 `PROJECT_ROOT`를 읽는다. 없으면 현재 작업 디렉토리를 사용한다.
2. `PROJECT_ROOT` 경로가 존재하는지 확인한다.
3. `PROJECT_ROOT/.automation/` 디렉토리가 없으면 생성한다.

### 1. 기존 conventions.json 확인

`PROJECT_ROOT/.automation/conventions.json`이 이미 존재하고 `--refresh-conventions`가 없으면:
- 파일 내용을 읽어서 주요 내용(stack, naming)을 출력하고 **즉시 종료**한다.
- "기존 conventions.json을 로드했습니다. 강제 재생성: `--refresh-conventions`" 메시지를 출력한다.

### 2. Layer 1 — 설정 파일 스캔

`PROJECT_ROOT`에서 설정 파일을 탐색하여 명시적 규칙을 추출한다:

| 카테고리 | 탐색 대상 |
|----------|-----------|
| 빌드/패키지 | `package.json`, `pom.xml`, `build.gradle(.kts)`, `Cargo.toml`, `go.mod`, `pyproject.toml` |
| 린트/포맷 | `.eslintrc*`, `.prettierrc*`, `eslint.config.*`, `checkstyle.xml`, `.editorconfig`, `biome.json` |
| 타입/컴파일 | `tsconfig*.json`, `vite.config.*`, `next.config.*`, `webpack.config.*` |
| 테스트 | `jest.config.*`, `vitest.config.*`, `pytest.ini` |

#### 2-1. 실행 커맨드 탐색 (`commands`)

빌드 도구 위치와 모듈 구조를 파악하여 **실제 실행 가능한 커맨드**를 `commands` 필드에 기록한다.
단순 도구명(`gradle`)이 아니라 PROJECT_ROOT에서 실행 가능한 전체 커맨드를 저장한다.

**탐색 절차:**

1. **빌드 래퍼 위치 확인**: `gradlew`, `mvnw` 등이 PROJECT_ROOT에 있는지, 서브 디렉토리에 있는지 확인
2. **모듈 구조 파악**: 멀티 모듈이면 주요 모듈 타겟을 식별 (예: `:core:compileJava`)
3. **package.json scripts 확인**: `build`, `test`, `lint`, `typecheck`, `format` 스크립트 존재 여부
4. **Makefile 확인**: `make build`, `make test` 등 타겟 존재 여부

**저장 예시:**

```json
{
  "commands": {
    "build": "cd server && ./gradlew :core:compileJava :fo:compileJava",
    "test": "cd server && ./gradlew test",
    "lint": null
  }
}
```

- 커맨드가 없는 항목은 `null`이 아닌 **필드 자체를 생략**한다.
- 모든 커맨드는 `PROJECT_ROOT`에서 실행된다고 가정한다.
- `cd` 가 필요하면 커맨드에 포함한다 (예: `cd server && ./gradlew build`).

### 3. Layer 2 — 외부 컨벤션 스킬 감지

스택을 감지하여 베스트 프랙티스를 적용한다. 감지 결과를 `convention_skills_applied`에 기록한다.

- `build.gradle` + `spring-boot-starter` → Google Java Style + Spring Boot Conventions
- `package.json` + `next` → Vercel Next.js Conventions
- `package.json` + `react` → React Conventions

### 4. Layer 3 — 기존 코드 분석

주요 디렉토리에서 3~5개 파일을 샘플링하여 암묵적 패턴을 추출한다:
- naming, style, annotations, patterns, forbidden, required

### 5. Layer 4 — CLAUDE.md 참조

`PROJECT_ROOT/CLAUDE.md`가 있으면 컨벤션 관련 지시를 추출하여 반영한다 (최하위 우선순위).

레이어 우선순위 상세는 `references/convention-layers.md` 참조.

### 6. conventions.json 생성

`schemas/conventions.schema.json`을 읽어서 필드 구조를 확인한 뒤, 분석 결과를 `PROJECT_ROOT/.automation/conventions.json`에 저장한다.

**작성 원칙:**
- 각 항목은 **한 줄로 명확하게** (긴 설명 금지)
- `forbidden`/`required`는 배열 — Skill 프롬프트에 바로 주입 가능한 수준
- 요약만 저장 (설정 파일 전체를 복사하지 않음)
- `learned_from_failures`는 빈 배열로 초기화

### 7. 검증 + 증거 생성

conventions.json 생성 후 post-learn Hook(`hooks/post-step/post-learn.sh`)이 자동 실행된다:

1. `conventions.schema.json`으로 스키마 검증
2. `.automation/evidence/learn.validated.json` 생성
3. 검증 실패 시 에러를 출력하고 스키마에 맞게 수정한다

> 다음 스텝(`/analyze`)의 pre-step Hook은 `learn.validated.json` 존재만 확인한다.

### 8. 결과 출력

1. 감지된 스택 요약 (language, framework, build)
2. 주요 컨벤션 요약 (naming, forbidden/required 핵심)
3. 적용된 외부 컨벤션 스킬 목록
4. conventions.json 경로 + 스키마 검증 결과

## 멀티 모듈 프로젝트

모노레포는 서브 디렉토리별 conventions.json을 추가 생성할 수 있다. 가까운 파일이 최우선.

```
project-root/.automation/conventions.json          ← 전체 기본값
server/.automation/conventions.json                ← 서버 모듈
apps/web/.automation/conventions.json              ← 프론트엔드
```

상세는 `references/convention-layers.md` 참조.
