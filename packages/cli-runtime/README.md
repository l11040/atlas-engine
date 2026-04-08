# @atlas/cli-runtime

`Claude CLI`/`Codex CLI`의 `stdin/stdout` 처리를 공통화한 런타임 패키지입니다.

이 패키지는 다음을 제공합니다.
- provider별 명령어 인자 생성 (`buildCliCommand`)
- stdout 라인 파싱 (`stream-json`, `jsonl`)
- provider별 이벤트 정규화 (`text/tool-use/tool-result/result`)
- 프로세스 실행/취소/타임아웃/스트리밍 (`startCliSession`, `runCliToCompletion`, `streamCliEvents`)

## 1. 요구사항

- Node.js 18+
- 실행 환경에 `claude` 또는 `codex` 명령어가 설치/인증되어 있어야 함

## 2. 설치

모노레포에서는 `workspace:*`로 연결합니다.

```json
{
  "dependencies": {
    "@atlas/cli-runtime": "workspace:*"
  }
}
```

## 3. 핵심 타입

- `ProviderType`: `"claude" | "codex"`
- `CliPermissionMode`: `"auto" | "manual"`
- `CliEvent.phase`:
  - `started`: 프로세스 시작
  - `text`: 모델 텍스트 출력
  - `tool-use`: 도구 호출 시작
  - `tool-result`: 도구 호출 결과
  - `result`: 세션 요약 메타(비용/턴수 등)
  - `stderr`: stderr 청크
  - `completed`: 정상 종료
  - `failed`: 실패 종료
  - `cancelled`: 취소 종료

## 4. API 요약

- `buildCliCommand(options)`
  - provider/permission/allowTools를 실제 CLI 인자로 변환
- `startCliSession(options)`
  - 실행 핸들(`cancel`, `result`)과 이벤트 콜백 기반 세션 제어
- `runCliToCompletion(options)`
  - 완료까지 대기하고 이벤트 배열 반환
  - 실패 시 `CliExecutionError` throw
- `streamCliEvents(options)`
  - 이벤트를 `AsyncGenerator`로 스트리밍

추가 옵션:
- `conversation`: `new | continue-last | resume-id` 세션 전략
- `promptTransport`: `auto | argv | stdin` (기본 auto: 긴 프롬프트는 stdin)
- `killGraceMs`: SIGTERM 이후 SIGKILL fallback 대기 시간

## 5. 빠른 사용법

### 5-1. 완료까지 실행 (`runCliToCompletion`)

```ts
import { runCliToCompletion, CliExecutionError } from "@atlas/cli-runtime";

try {
  const events = await runCliToCompletion({
    provider: "claude",
    prompt: "Reply with exactly: OK",
    cwd: process.cwd(),
    permissionMode: "manual",
    timeoutMs: 60_000,
    allowTools: false
  });

  const text = events
    .filter((e) => e.phase === "text")
    .map((e) => (e.phase === "text" ? e.text : ""))
    .join("");

  console.log(text);
} catch (error) {
  if (error instanceof CliExecutionError) {
    console.error(error.message);
    console.error("stderr:", error.stderr);
    console.error("events:", error.events.length);
  }
}
```

### 5-2. 실시간 스트리밍 (`streamCliEvents`)

```ts
import { streamCliEvents } from "@atlas/cli-runtime";

for await (const event of streamCliEvents({
  provider: "codex",
  prompt: "List changed files only",
  cwd: process.cwd(),
  permissionMode: "auto",
  timeoutMs: 120_000,
  allowTools: true
})) {
  if (event.phase === "text") {
    process.stdout.write(event.text);
  }
  if (event.phase === "stderr") {
    process.stderr.write(event.chunk);
  }
}
```

### 5-3. 세션 핸들 제어 (`startCliSession`)

```ts
import { startCliSession } from "@atlas/cli-runtime";

const session = startCliSession({
  requestId: crypto.randomUUID(),
  provider: "claude",
  prompt: "Analyze this repository",
  cwd: process.cwd(),
  permissionMode: "manual",
  timeoutMs: 300_000,
  allowTools: true,
  onEvent(event) {
    if (event.phase === "tool-use") {
      console.log("tool:", event.tool.name, event.tool.input);
    }
  },
  onParseError({ provider, rawLine, error }) {
    console.warn(`[${provider}] parse error`, error.message, rawLine);
  }
});

setTimeout(() => {
  // 필요 시 외부 취소
  session.cancel();
}, 10_000);

const result = await session.result;
console.log(result.status, result.exitCode);
```

### 5-4. 세션 재개/이어쓰기

```ts
await runCliToCompletion({
  provider: "claude",
  prompt: "이전 대화 이어서 작업해",
  cwd: process.cwd(),
  permissionMode: "manual",
  timeoutMs: 120_000,
  conversation: { mode: "continue-last" }
});
```

## 6. 에러 처리 규약

실패는 `CliExecutionError`로 통일됩니다.

- `message`: 사용자 표시용 에러 메시지
- `status`: `failed | cancelled | timeout`
- `stderr`: 누적 stderr
- `exitCode`: 종료 코드(있는 경우)
- `events`: 실패 직전까지의 정규화 이벤트
- `events`에는 `phase: "parse-error"`가 포함될 수 있음

디버깅 시 권장 순서:
1. `status` 확인
2. `stderr` 확인
3. `events`에서 마지막 `text/tool-result/failed` 확인

## 7. provider 동작 차이

### Claude
- 명령: `claude -p <prompt> --output-format stream-json --verbose ...`
- `allowTools: false`면 `--allowedTools ""`로 도구 사용 차단
- 결과 메타(`costUsd`, `durationMs`, `numTurns`)가 `result` 이벤트로 전달됨

### Codex
- 명령: `codex exec --json --skip-git-repo-check ...`
- `permissionMode: auto`면 `--full-auto` 추가
- `item.started/item.completed`를 매칭해 `tool-use/tool-result` 생성
- `file_change`가 다중 파일일 때 `tool.input.file_paths` 배열도 함께 제공

## 8. 통합 패턴

### Electron IPC Provider

- `startCliSession(... onEvent ...)`로 이벤트를 `webContents.send`에 연결
- `runningJobs` 맵에 세션 핸들을 저장
- `cancel(requestId)`에서 `session.cancel()` 호출

## 9. 운영 체크리스트

- 타임아웃은 provider/작업 타입별로 분리해서 관리할 것
- `manual` 모드에서 권한 프롬프트를 사용자 UX와 맞출 것
- parse error 로그를 버리지 말고 추적 시스템으로 수집할 것
- `stderr`는 UI에서 숨기지 말고 디버그 보기로 노출할 것

## 10. 알려진 한계

- `prompt`를 CLI 인자로 전달하므로 매우 긴 입력은 OS 길이 제한에 걸릴 수 있음
- `manual` 모드의 Codex 승인 동작은 CLI 기본 동작에 의존함
- unit test(파서/정규화/수명주기)는 현재 별도 추가 필요
