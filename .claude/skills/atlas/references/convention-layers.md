# 컨벤션 레이어 우선순위

## 레이어 구조

```
┌─────────────────────────────────┐
│  Layer 0: 컨벤션 파일 (최우선)    │  .automation/conventions.json
│  한 번 생성, 이후 참조만          │  여러 위치에 여러 개 가능
├─────────────────────────────────┤
│  Layer 1: 설정 파일 (자동 탐지)   │  기계가 읽을 수 있는 명시적 규칙
├─────────────────────────────────┤
│  Layer 2: 외부 컨벤션 스킬        │  프레임워크/언어 자동 감지 후 로드
├─────────────────────────────────┤
│  Layer 3: 기존 코드 분석          │  설정 파일에 없는 암묵적 규칙
├─────────────────────────────────┤
│  Layer 4: CLAUDE.md (있으면)      │  선택적 오버라이드. 없어도 동작
└─────────────────────────────────┘
```

**충돌 시**: Layer 0 > Layer 1 > Layer 2 > Layer 3 > Layer 4

## Layer 1 설정 파일 상세

| 파일 | 추출 정보 |
|------|----------|
| `package.json` | 의존성, scripts, engines |
| `pom.xml` / `build.gradle` | Java 버전, 의존성, 플러그인 |
| `tsconfig.json` | strict 모드, paths, target |
| `.eslintrc*` / `eslint.config.*` | 린트 규칙 |
| `.prettierrc*` | 포맷 규칙 |
| `checkstyle.xml` | Java 스타일 규칙 |
| `.editorconfig` | 들여쓰기, 줄바꿈 규칙 |
| `sonar-project.properties` | 정적 분석 규칙 |

## Layer 2 외부 컨벤션 스킬 감지 규칙

| 감지 조건 | 적용 스킬 |
|-----------|----------|
| `pom.xml` 존재 | java + maven |
| `build.gradle` + `spring-boot-starter` | Google Java Style + Spring Boot Conventions |
| `package.json` + `next` | Vercel Next.js Conventions |
| `package.json` + `react` | React Conventions |
| `tsconfig.json` 존재 | TypeScript |
| `go.mod` 존재 | Go |
| `Cargo.toml` 존재 | Rust |
| `Dockerfile` 존재 | Docker Best Practices |

## Layer 3 코드 분석 항목

| 항목 | 분석 내용 |
|------|-----------|
| naming | 파일명, 클래스/인터페이스명, 메서드명, 변수명, 패키지 구조 |
| style | 들여쓰기, 줄 길이, braces, import 정렬 |
| annotations | 레이어별 어노테이션/데코레이터 |
| patterns | 에러 핸들링, 응답 포맷, 페이지네이션, 유효성 검증 |
| forbidden | 코드에서 일관되게 회피하는 패턴 |
| required | 코드에서 일관되게 적용하는 패턴 |

## 멀티 모듈 conventions.json 우선순위

가장 가까운(specific) 파일이 최우선:

```
server/core/.automation/conventions.json   ← 최우선
server/.automation/conventions.json        ← 그다음
.automation/conventions.json               ← 프로젝트 전체 기본값
```

Task가 `server/core/` 하위 파일을 생성할 때, 경로 상의 모든 컨벤션 파일을 로드하되 가까운 게 이긴다.

## 생성 및 갱신 규칙

| 상황 | 동작 |
|------|------|
| 최초 실행, 파일 없음 | Layer 1~4 분석 → conventions.json 생성 |
| 파일 존재 | 바로 로드 (재분석 안 함) |
| Review 실패 학습 | `required`/`forbidden`에 항목 **추가만** |
| `--refresh-conventions` | 강제 재생성 |
