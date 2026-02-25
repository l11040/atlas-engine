# claude.md

## Purpose
This file defines project-specific working rules for Claude Code in this repository.

## Claude Code Notes (from official docs)
- Claude Code supports project memory files and can initialize them with `/init`.
- Claude Code supports editing memory with `/memory`.
- Claude Code supports importing additional markdown files using `@path/to/file.md`.

## Repository Structure

```
apps/desktop/                      Electron desktop app (React + TypeScript + Tailwind + shadcn)
├── electron/                      메인 프로세스
│   ├── main.ts                    앱 진입점
│   ├── preload.ts                 preload 스크립트 (contextBridge)
│   ├── ipc/                       IPC 핸들러 등록
│   ├── services/
│   │   ├── config/                앱 설정 읽기/쓰기
│   │   ├── git/                   Git diff 서비스
│   │   ├── langchain/             LangGraph 기반 flow 실행 엔진
│   │   └── providers/             CLI provider 추상화 (claude, codex)
│   │       ├── claude/            Claude CLI provider + stream-json 파서
│   │       ├── codex/             Codex CLI provider + jsonl 파서
│   │       ├── registry.ts        provider 레지스트리
│   │       └── types.ts           provider 공통 인터페이스
│   └── window/                    BrowserWindow 생성
├── shared/                        메인/프리로드/렌더러 공유 계약
│   └── ipc.ts                     IPC 채널·타입 정의 (단일 소스)
└── src/                           렌더러 (React)
    ├── main.tsx                   렌더러 진입점
    ├── router.tsx                 react-router 라우트 정의
    ├── pages/                     라우트별 페이지 컴포넌트 (모든 페이지는 여기에 배치)
    │   ├── main-page.tsx
    │   ├── settings-page.tsx
    │   └── pipeline-page.tsx
    ├── features/                  기능별 모듈 (컴포넌트 + 훅)
    │   ├── pipeline/              Ticket → Todo 파이프라인
    │   │   ├── components/        파이프라인 UI 컴포넌트
    │   │   ├── hooks/             파이프라인 상태 관리 훅
    │   │   └── phases/            phase별 콘텐츠 (intake, dor, plan)
    │   └── session/               CLI 세션·인증 관련
    │       ├── components/        세션 UI 컴포넌트
    │       └── hooks/             CLI 인증·세션 훅
    ├── components/ui/             shadcn/ui 컴포넌트 (수정 금지)
    ├── hooks/                     공유 커스텀 훅 (feature에 속하지 않는 것)
    └── lib/                       유틸리티 함수
packages/*                         Turborepo 공유 패키지 (예약)
```

## File Naming Convention (Mandatory)
- All project source filenames must use **kebab-case**.
- Do not create camelCase or PascalCase filenames.
- Examples:
  - `register-claude-ipc.ts`
  - `create-main-window.ts`
  - `use-claude-console.ts`
  - `auth-status-card.tsx`

## Development Rules

### Electron 메인 프로세스
- window 생성: `electron/window/*`
- IPC 핸들러 등록: `electron/ipc/*`
- CLI provider 추상화: `electron/services/providers/*`
- LangGraph flow 엔진: `electron/services/langchain/*`

### 렌더러 (feature-based 구조)
- 라우트 페이지 컴포넌트는 반드시 `src/pages/`에 배치한다. feature 폴더에 페이지를 두지 않는다.
- feature 폴더(`src/features/<feature-name>/`)에는 컴포넌트·훅만 배치한다.
- feature 내부 구조: `components/`, `hooks/`, 필요 시 `phases/` 등 하위 폴더를 사용한다.
- feature에 속하지 않는 공유 훅은 `src/hooks/`에 둔다.
- feature 간 import는 `@/features/<name>/...` 절대 경로를 사용한다.

### IPC 계약
- IPC 타입·채널은 `apps/desktop/shared/ipc.ts` 단일 파일에서만 정의한다.
- 렌더러에서는 `@shared/ipc` 경로 별칭으로 import한다.

## UI Component Rules (Mandatory)
- 기본 UI 요소는 **shadcn/ui 컴포넌트를 최우선으로 사용**한다.
- shadcn 컴포넌트가 존재하면 네이티브 HTML 태그(`<input>`, `<textarea>`, `<button>` 등)를 직접 사용하지 않는다.
- 현재 설치된 shadcn 컴포넌트: `Button`, `Input`, `Textarea`, `Badge`, `Collapsible`, `Dialog`, `Sheet`, `Label`, `Select`, `Separator`
- 새 컴포넌트가 필요하면 `npx shadcn@latest add <component>` 로 설치한 뒤 사용한다.
- shadcn 컴포넌트는 `@/components/ui/*`에 위치하며 직접 수정하지 않는다. 커스터마이징은 `className` prop으로 처리한다.
- 펼치기/접기 UI에는 `Collapsible` (`@radix-ui/react-collapsible`)을 사용한다.
- 상태 뱃지 표시에는 `Badge` 를 사용한다.
- feature 컴포넌트(`src/features/*/components/*`)에서 새 네이티브 HTML 입력 요소를 도입하기 전에 shadcn에 동등한 컴포넌트가 있는지 먼저 확인한다.

## Design Token Rules (Mandatory)
- Define design tokens only in `apps/desktop/src/index.css` `:root` block.
- Group tokens by category:
  - color: `--color-*`
  - typography: `--font-*`
  - spacing/radius/shadow: `--space-*`, `--radius-*`, `--shadow-*`
- Do not hardcode color values (e.g. `#fff`, `text-zinc-600`) in feature components.
- Do not hardcode font-size values in feature components.
- When introducing new UI, add/extend tokens first, then consume those tokens in components.
- Token names must be semantic, not brand/new-feature specific.

## Comment Rules (Mandatory)

### 공통 원칙
- 비자명한 흐름, 라이프사이클 경계, IPC 계약, 폴백 로직에 주석을 작성한다.
- 자명한 한 줄 대입이나 단순 JSX 마크업에는 주석을 달지 않는다.
- 한국어 단문을 기본으로 사용한다.
- 접두사 형식:
  - `// 목적: ...` — 이 코드 블록이 달성하려는 것
  - `// 이유: ...` — 대안 대신 이 방식을 선택한 근거
  - `// 주의: ...` — 놓치면 버그로 이어지는 주의사항
- 주석은 설명 대상 코드 바로 위에 작성한다.
- 동작이 바뀌면 주석도 즉시 갱신한다. 오래된 주석은 허용하지 않는다.

### Custom Hook (`src/hooks/*`, `src/features/*/hooks/*`)
- 파일 상단에 훅의 **책임 범위**를 한 줄로 명시한다.
  - `// 책임: Claude CLI 인증 상태 조회 및 갱신을 관리한다.`
- React 라이프사이클 관련 비자명한 결정에 `// 이유:`를 작성한다.
  - Strict Mode 대응, ref 사용 이유, cleanup 전략 등
- `useEffect` 블록에는 **실행 조건과 목적**을 명시한다.
  - `// 목적: 마운트 시 인증 상태 조회를 1회만 실행한다.`
- 이벤트 리스너의 **필터링 조건**이 있으면 반드시 주석을 작성한다.
  - `// 목적: 현재 실행 중인 요청의 이벤트만 화면 상태에 반영한다.`
- 외부로 노출하는 `return` 객체에 파생 상태(`useMemo`)의 **의도**를 명시한다.
- 자명한 `useState` 선언, 단순 setter 전달에는 주석을 달지 않는다.

### Component (`src/features/*/components/*`)
- props 인터페이스가 비자명한 콜백이나 조건부 props를 포함하면 해당 필드에 주석을 작성한다.
- 조건부 렌더링이나 상태-레이블 매핑 로직이 복잡하면 `// 목적:`을 작성한다.
- 단순 표시용 컴포넌트(props → JSX 직결)에는 주석을 달지 않는다.
- 컴포넌트 내부에서 파생 값을 계산하는 로직이 있으면 `// 이유:`를 작성한다.

### Service / Main Process (`electron/services/*`)
- 다단계 워크플로우는 **단계 번호와 목적**을 명시한다.
  - `// 목적: 1단계 - CLI 실행 가능 여부를 확인한다.`
  - `// 목적: 2단계 - 로컬 인증 설정 파일 존재 여부를 확인한다.`
- 프로세스 spawn 시 `stdio`, `shell`, `timeout` 등 비자명한 옵션에 `// 주의:`를 작성한다.
- 에러 분기마다 어떤 상태로 분류되는지 명시한다 (특히 exit code, 시그널 해석).
- 타임아웃·cleanup 로직에는 해제 시점과 이유를 명시한다.

### IPC Contract (`shared/ipc.ts`)
- 채널 상수 그룹 위에 **채널의 통신 방향과 역할**을 한 줄로 명시한다.
  - `// 렌더러 → 메인: Claude CLI 실행 요청/취소 및 인증 상태 조회`
- union type이 3가지 이상 분기를 가지면 각 분기의 **발생 조건**을 명시한다.
- 단순 요청/응답 인터페이스(필드가 자명한 경우)에는 주석을 달지 않는다.

### IPC Handler (`electron/ipc/*`)
- 각 `ipcMain.handle` 등록부에 **어떤 서비스 함수를 연결하는지** 명시한다.
- 에러를 잡아서 재전파하는 패턴에는 `// 이유:`를 작성한다.

### Utility (`src/lib/*`)
- 함수가 외부 라이브러리를 조합하는 경우 **조합 의도**를 한 줄로 명시한다.
- 순수 래퍼 함수(인자를 그대로 전달)에는 주석을 달지 않는다.

## Comment Examples
- Good:
  - `// 책임: Claude CLI 인증 상태 조회 및 갱신을 관리한다.`
  - `// 목적: 현재 요청의 이벤트만 반영한다.`
  - `// 이유: React Strict Mode에서 effect 중복 실행을 방지한다.`
  - `// 주의: 비정상 종료는 completed가 아니라 failed로 처리한다.`
  - `// 목적: 1단계 - CLI 실행 가능 여부를 확인한다.`
  - `// 렌더러 → 메인: Claude CLI 실행 요청/취소 및 인증 상태 조회`
- Bad:
  - `// set state`
  - `// call function`
  - `// useState for prompt` (자명한 선언)
  - `// return JSX` (자명한 마크업)

## Commands
- Install: `pnpm install`
- Dev: `pnpm --filter desktop dev`
- Typecheck: `pnpm --filter desktop typecheck`
- Build: `pnpm --filter desktop build`
