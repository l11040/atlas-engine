# @atlas/cli-runtime 사용 설명서

이 문서는 처음 사용하는 개발자를 기준으로, 설치부터 실전 통합까지 단계별로 설명합니다.

## 1. 이 패키지가 해결하는 문제

CLI 기반 LLM(Claude/Codex)을 직접 붙이면 보통 다음이 반복됩니다.
- provider마다 다른 명령어/출력 포맷 처리
- stdout line buffering + JSON 파싱
- tool-use / tool-result 매칭
- timeout/cancel/에러 처리
- 이벤트 스트림 표준화

`@atlas/cli-runtime`은 이 문제를 공통 런타임으로 정리합니다.

## 2. 최소 설치

### 모노레포(workspace)

```json
{
  "dependencies": {
    "@atlas/cli-runtime": "workspace:*"
  }
}
```

### 단독 프로젝트(추후 publish 기준)

```bash
pnpm add @atlas/cli-runtime
```

## 3. 가장 먼저 알아야 할 개념

1. `ProviderType`
- `claude` 또는 `codex`

2. `CliPermissionMode`
- `auto`: 자동 승인 중심
- `manual`: 사용자 확인 기반

3. `CliEvent`
- 모든 실행 결과는 이벤트 스트림으로 도착
- UI/로그/상태 머신은 이벤트를 소비해서 구축

4. 실행 API 3가지
- `startCliSession`: 세션 핸들 중심(취소 제어 강함)
- `runCliToCompletion`: 완료 결과 배열 필요할 때
- `streamCliEvents`: 실시간 소비가 필요할 때

## 4. 빠른 시작

## 4-1. 완료까지 기다리는 가장 단순한 코드

```ts
import { runCliToCompletion } from "@atlas/cli-runtime";

const events = await runCliToCompletion({
  provider: "claude",
  prompt: "Reply with exactly: hello",
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
```

## 4-2. 이벤트를 바로바로 받는 스트리밍 코드

```ts
import { streamCliEvents } from "@atlas/cli-runtime";

for await (const event of streamCliEvents({
  provider: "codex",
  prompt: "Find all TODO comments",
  cwd: process.cwd(),
  permissionMode: "manual",
  timeoutMs: 120_000,
  allowTools: true
})) {
  switch (event.phase) {
    case "text":
      process.stdout.write(event.text);
      break;
    case "tool-use":
      console.log("\n[tool-use]", event.tool.name, event.tool.input);
      break;
    case "tool-result":
      console.log("\n[tool-result]", event.toolResult.toolUseId);
      break;
    case "stderr":
      process.stderr.write(event.chunk);
      break;
  }
}
```

## 4-3. 취소 가능한 세션 핸들 패턴

```ts
import { startCliSession } from "@atlas/cli-runtime";

const session = startCliSession({
  requestId: crypto.randomUUID(),
  provider: "claude",
  prompt: "Analyze repository and suggest refactor",
  cwd: process.cwd(),
  permissionMode: "manual",
  timeoutMs: 300_000,
  allowTools: true,
  onEvent(event) {
    console.log(event.phase);
  }
});

const timer = setTimeout(() => {
  session.cancel();
}, 10_000);

const result = await session.result;
clearTimeout(timer);

console.log(result.status, result.error ?? "ok");
```

## 4-4. 세션 이어쓰기/재개/신규 시작

`conversation` 옵션으로 세션 전략을 지정할 수 있습니다.

```ts
await window.atlas.runCli({
  requestId: crypto.randomUUID(),
  provider: "claude",
  prompt: "이전 문맥 이어서 진행해",
  conversation: { mode: "continue-last" }
});

await window.atlas.runCli({
  requestId: crypto.randomUUID(),
  provider: "codex",
  prompt: "이 세션 이어서 TODO 2번 처리",
  conversation: { mode: "resume-id", sessionId: "8f8f...-uuid" }
});

await window.atlas.runCli({
  requestId: crypto.randomUUID(),
  provider: "claude",
  prompt: "완전히 새 세션으로 시작",
  conversation: { mode: "new", ephemeral: true }
});
```

## 5. 이벤트 필드 해석

### `phase: "started"`
- 세션 시작 시 1회
- `pid` 제공

### `phase: "text"`
- 모델 자연어 응답 조각
- 최종 답변은 여러 `text`를 합쳐 생성

### `phase: "tool-use"`
- 도구 실행 시작
- `tool.id` 기준으로 타임라인 키 생성

### `phase: "tool-result"`
- 도구 결과
- `toolResult.toolUseId`로 `tool-use`와 매칭

### `phase: "result"`
- provider가 제공하는 세션 요약 메타
- Claude는 비용/시간/턴 수가 비교적 풍부
- Codex는 일부만 제공될 수 있음

### `phase: "stderr"`
- stderr 원문 청크
- UI에서 숨기지 말고 디버그 뷰로 노출 권장

### `phase: "parse-error"`
- stdout 라인 파싱 실패 이벤트
- 원문 라인(`rawLine`)과 에러 메시지(`error`) 포함
- 운영 모니터링에서 반드시 집계 권장

### `phase: "completed"`
- 정상 종료

### `phase: "failed"`
- 비정상 종료/실패
- `error` 필드 사용

### `phase: "cancelled"`
- 취소 종료

## 6. 에러 처리 베스트 프랙티스

```ts
import { CliExecutionError, runCliToCompletion } from "@atlas/cli-runtime";

try {
  await runCliToCompletion({
    provider: "codex",
    prompt: "...",
    cwd: process.cwd(),
    permissionMode: "manual",
    timeoutMs: 30_000
  });
} catch (error) {
  if (error instanceof CliExecutionError) {
    console.error("status:", error.status);
    console.error("message:", error.message);
    console.error("exitCode:", error.exitCode);
    console.error("stderr:", error.stderr);
    console.error("events:", error.events.length);
  } else {
    console.error(error);
  }
}
```

권장 디버깅 순서:
1. `status` (`failed/cancelled/timeout`)
2. `stderr`
3. 마지막 `text`/`tool-result` 이벤트
4. 원본 프롬프트/권한 모드/작업 디렉토리

## 7. 실전 통합 템플릿

## 7-1. Electron IPC

- Main Process
  1. `runningJobs: Map<requestId, CliSessionHandle>` 유지
  2. run 시 `startCliSession` 호출 + `onEvent -> webContents.send`
  3. cancel 시 `runningJobs.get(id)?.cancel()`
  4. `session.result.finally(() => runningJobs.delete(id))`

- Renderer
  1. `requestId` 생성
  2. 현재 requestId 이벤트만 필터링
  3. `text` 누적 + `tool-use/result` 타임라인 업데이트

## 7-2. LangChain 래핑

- `_call`에서 `runCliToCompletion`
- `text` 이벤트만 합쳐 반환
- `tool-use/result`와 `stderr`는 별도 trace 저장

## 8. provider별 주의사항

### Claude
- `allowTools: false`일 때 도구 사용 차단 옵션이 들어감
- stream-json 포맷 파싱 실패 시 `onParseError`로 감지 가능

### Codex
- `file_change` 이벤트는 다중 파일 가능
- `tool.input.file_paths` 배열을 우선 사용
- `permissionMode: auto`는 `--full-auto`를 사용, `manual`은 codex 기본 동작(승인 요청)

## 9. 운영 가이드

1. timeout 기본값을 길게 시작하고(예: 300초), 작업 유형별로 조정
2. 실패한 세션의 `events + stderr + prompt hash`를 저장
3. parse-error 빈도 추적 지표를 별도로 수집
4. CLI 버전 업그레이드 시 샘플 로그 재검증

## 10. 문제 해결 FAQ

Q1. `command was not found in PATH`
- CLI 설치 여부 확인
- 실행 사용자의 PATH 확인

Q2. 즉시 실패하고 stderr가 비어 있음
- 권한 문제(EACCES/EPERM) 가능성
- 실행 파일 권한, working directory 접근 권한 점검

Q3. tool timeline이 비정상적으로 비어 있음
- parse-error 로그 확인
- provider 출력 포맷 변경 여부 확인

Q4. 취소했는데 프로세스가 남는 느낌이 듦
- 현재는 SIGTERM 후 `killGraceMs` 경과 시 SIGKILL fallback 적용
- `startCliSession({ killGraceMs })` 값을 줄여 종료 강도를 높일 수 있음

## 11. 권장 확장 작업

1. provider별 fixture 기반 테스트 자동화
2. parse-error 운영 메트릭/알람 표준화
3. provider 플러그인 인터페이스(`command/parser/normalizer`) 일반화
4. semver API surface 고정 + 변경 로그 체계화
