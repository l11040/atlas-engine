# claude.md

## Purpose
This file defines project-specific working rules for Claude Code in this repository.

## Claude Code Notes (from official docs)
- Claude Code supports project memory files and can initialize them with `/init`.
- Claude Code supports editing memory with `/memory`.
- Claude Code supports importing additional markdown files using `@path/to/file.md`.

## Repository Structure
- `apps/desktop`: Electron desktop app (React + TypeScript + Tailwind + shadcn)
- `apps/desktop/electron`: main process, IPC, and Claude CLI services
- `apps/desktop/src`: renderer app, hooks, and UI components
- `apps/desktop/shared`: shared IPC contracts between main/preload/renderer
- `packages/*`: reserved for shared packages in the Turborepo workspace

## File Naming Convention (Mandatory)
- All project source filenames must use **kebab-case**.
- Do not create camelCase or PascalCase filenames.
- Examples:
  - `register-claude-ipc.ts`
  - `create-main-window.ts`
  - `use-claude-console.ts`
  - `auth-status-card.tsx`

## Development Rules
- Keep Electron main process logic split by responsibility:
  - window creation in `electron/window/*`
  - IPC registration in `electron/ipc/*`
  - Claude CLI runtime/auth logic in `electron/services/claude/*`
- Keep renderer UI logic split by responsibility:
  - state/effects in `src/hooks/*`
  - visual components in `src/components/*`
- IPC contracts must be defined only in `apps/desktop/shared/ipc.ts`.

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

### Custom Hook (`src/hooks/*`)
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

### Component (`src/components/*`)
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
