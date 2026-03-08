# atlas-engine

Turborepo 기반 모노레포입니다. 현재 `apps/desktop`에 Electron + React + TypeScript + TailwindCSS + shadcn/ui 구성이 포함되어 있습니다.

## 시작하기

```bash
pnpm install
pnpm dev
```

## 구조

- `apps/desktop`: 데스크탑 앱 (Electron + Vite)
- `packages/cli-runtime`: Claude/Codex stdin/stdout 공통 런타임 패키지

## 문서

- `docs/cli-stdin-stdout-design-review.md`: 현재 설계와 비판적 리뷰
- `docs/cli-runtime-user-guide.md`: 패키지 사용 설명서

## 주요 명령

```bash
pnpm dev        # 전체 워크스페이스 개발
pnpm build      # 전체 워크스페이스 빌드
pnpm --filter desktop dev
pnpm --filter desktop build
```
