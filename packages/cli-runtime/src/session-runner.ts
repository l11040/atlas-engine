// 책임: CLI 프로세스를 spawn하고 stdout/stderr를 정규화 이벤트로 변환해 세션 단위로 제공한다.

import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { buildCliCommand } from "./command";
import { CliExecutionError } from "./errors";
import { createStreamJsonParser } from "./parsers/stream-json-parser";
import { normalizeClaudeStreamJsonEvent } from "./normalizers/claude-normalizer";
import { createJsonlParser } from "./parsers/jsonl-parser";
import { createCodexNormalizer } from "./normalizers/codex-normalizer";
import type {
  CliEvent,
  CliSessionHandle,
  CliSessionResult,
  CliSessionStatus,
  CliSpawnOptions,
  ProviderType,
  StartCliSessionOptions
} from "./types";

type CliChildProcess = ChildProcessByStdio<Writable | null, Readable, Readable>;

interface FeedAndFlush {
  feed(chunk: string): void;
  flush(): void;
}

interface ParseIssue {
  provider: ProviderType;
  rawLine: string;
  error: Error;
}

// 목적: text 포맷용 패스스루 파서. stdout 청크를 그대로 text 이벤트로 변환한다.
function createTextPassthroughParser(
  requestId: string,
  provider: ProviderType,
  onEvent: (event: CliEvent) => void
): FeedAndFlush {
  return {
    feed(chunk: string) {
      if (chunk) {
        onEvent({
          requestId,
          provider,
          phase: "text",
          text: chunk,
          timestamp: Date.now()
        });
      }
    },
    flush() { /* noop */ }
  };
}

function createParserForProvider(
  provider: ProviderType,
  requestId: string,
  outputFormat: string,
  onEvent: (event: CliEvent) => void,
  onParseIssue: (issue: ParseIssue) => void
): FeedAndFlush {
  // 이유: text 포맷은 JSON 파싱 없이 stdout 청크를 그대로 text 이벤트로 전달한다.
  if (outputFormat === "text") {
    return createTextPassthroughParser(requestId, provider, onEvent);
  }

  if (provider === "claude") {
    return createStreamJsonParser(
      (rawEvent) => {
        for (const event of normalizeClaudeStreamJsonEvent(requestId, rawEvent)) {
          onEvent(event);
        }
      },
      (rawLine, error) => {
        onParseIssue({ provider, rawLine, error });
      }
    );
  }

  const normalizeCodexEvent = createCodexNormalizer();

  return createJsonlParser(
    (rawEvent) => {
      for (const event of normalizeCodexEvent(requestId, rawEvent)) {
        onEvent(event);
      }
    },
    (rawLine, error) => {
      onParseIssue({ provider, rawLine, error });
    }
  );
}

function findLastTextHint(events: CliEvent[]): string {
  const lastText = [...events].reverse().find((event) => event.phase === "text");
  if (lastText && lastText.phase === "text") {
    return lastText.text.slice(0, 240);
  }
  return "";
}

interface PendingTermination {
  status: CliSessionStatus;
  error: string;
  signal: NodeJS.Signals;
}

// 목적: 단일 CLI 실행 세션을 시작하고 취소/결과 Promise를 핸들로 반환한다.
export function startCliSession(options: StartCliSessionOptions): CliSessionHandle {
  const { command, args, stdinPayload } = buildCliCommand(options);

  const child = spawn(command, args, {
    cwd: options.cwd,
    shell: false,
    // 주의: 긴 프롬프트는 stdin(pipe)로 전달하고, 기본은 ignore로 유지한다.
    stdio: [stdinPayload != null ? "pipe" : "ignore", "pipe", "pipe"]
  }) as CliChildProcess;

  const events: CliEvent[] = [];
  let stderr = "";
  let settled = false;
  let flushed = false;
  let abortHandler: (() => void) | null = null;
  let cancelSession: (() => void) | null = null;
  let pendingTermination: PendingTermination | null = null;
  let forceKillTimer: NodeJS.Timeout | null = null;

  const killGraceMs = Math.max(0, options.killGraceMs ?? 3_000);

  function publish(event: CliEvent) {
    events.push(event);
    try {
      options.onEvent?.(event);
    } catch {
      // 이유: 소비자 콜백 예외로 러너가 중단되면 세션 추적이 끊기므로 예외를 삼킨다.
    }
  }

  const parser = createParserForProvider(
    options.provider,
    options.requestId,
    options.outputFormat ?? "stream-json",
    publish,
    ({ provider, rawLine, error }) => {
      publish({
        requestId: options.requestId,
        provider,
        phase: "parse-error",
        rawLine: rawLine.slice(0, 4_000),
        error: error.message,
        timestamp: Date.now()
      });
      options.onParseError?.({ provider, rawLine, error });
    }
  );

  function flushParserOnce() {
    if (flushed) return;
    flushed = true;
    parser.flush();
  }

  function clearForceKillTimer() {
    if (!forceKillTimer) return;
    clearTimeout(forceKillTimer);
    forceKillTimer = null;
  }

  function scheduleForceKill() {
    clearForceKillTimer();
    if (killGraceMs === 0) {
      try {
        child.kill("SIGKILL");
      } catch {
        // no-op
      }
      return;
    }

    forceKillTimer = setTimeout(() => {
      if (settled) return;
      try {
        child.kill("SIGKILL");
      } catch {
        // no-op
      }
    }, killGraceMs);

    forceKillTimer.unref?.();
  }

  function resolveResult(
    resolve: (result: CliSessionResult) => void,
    params: Omit<CliSessionResult, "events" | "stderr">
  ) {
    resolve({
      ...params,
      events,
      stderr
    });
  }

  function requestTermination(status: CliSessionStatus, error: string, signal: NodeJS.Signals, eventPhase: "cancelled" | "failed") {
    if (pendingTermination || settled) return;
    pendingTermination = { status, error, signal };

    if (eventPhase === "cancelled") {
      publish({
        requestId: options.requestId,
        provider: options.provider,
        phase: "cancelled",
        timestamp: Date.now()
      });
    } else {
      publish({
        requestId: options.requestId,
        provider: options.provider,
        phase: "failed",
        error,
        timestamp: Date.now()
      });
    }

    try {
      child.kill(signal);
    } catch {
      // no-op
    }

    scheduleForceKill();
  }

  const result = new Promise<CliSessionResult>((resolve) => {
    function finalize(params: Omit<CliSessionResult, "events" | "stderr">) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearForceKillTimer();
      if (abortHandler && options.signal) {
        options.signal.removeEventListener("abort", abortHandler);
      }
      flushParserOnce();
      resolveResult(resolve, params);
    }

    function doCancel() {
      requestTermination("cancelled", "CLI execution was cancelled", "SIGTERM", "cancelled");
    }

    cancelSession = doCancel;

    publish({
      requestId: options.requestId,
      provider: options.provider,
      phase: "started",
      pid: child.pid ?? -1,
      timestamp: Date.now()
    });

    if (stdinPayload != null && child.stdin) {
      child.stdin.on("error", (error) => {
        const code = (error as NodeJS.ErrnoException).code;
        // 이유: 상대 프로세스가 빨리 종료되면 EPIPE가 발생할 수 있으나 종료 처리에서 정리된다.
        if (code === "EPIPE" || code === "ERR_STREAM_DESTROYED") return;
        requestTermination("failed", `stdin write failed: ${error.message}`, "SIGTERM", "failed");
      });
      child.stdin.end(stdinPayload);
    }

    child.stdout.on("data", (chunk) => {
      parser.feed(chunk.toString());
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      publish({
        requestId: options.requestId,
        provider: options.provider,
        phase: "stderr",
        chunk: text,
        timestamp: Date.now()
      });
    });

    child.once("error", (error) => {
      const friendlyError =
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? `${command} command was not found in PATH`
          : error.message;

      publish({
        requestId: options.requestId,
        provider: options.provider,
        phase: "failed",
        error: friendlyError,
        timestamp: Date.now()
      });

      finalize({
        status: "failed",
        exitCode: null,
        signal: null,
        error: friendlyError
      });
    });

    child.once("close", (exitCode, signal) => {
      if (settled) return;

      if (pendingTermination) {
        finalize({
          status: pendingTermination.status,
          exitCode: exitCode ?? null,
          signal: signal ?? pendingTermination.signal,
          error: pendingTermination.error
        });
        return;
      }

      if ((exitCode ?? 0) !== 0) {
        const textHint = findLastTextHint(events);
        const message = stderr.trim()
          || (textHint ? `CLI exited with code ${exitCode ?? -1}: ${textHint}` : `CLI exited with code ${exitCode ?? -1}`);

        publish({
          requestId: options.requestId,
          provider: options.provider,
          phase: "failed",
          error: message,
          timestamp: Date.now()
        });

        finalize({
          status: "failed",
          exitCode: exitCode ?? null,
          signal,
          error: message
        });
        return;
      }

      publish({
        requestId: options.requestId,
        provider: options.provider,
        phase: "completed",
        exitCode: exitCode ?? -1,
        signal,
        timestamp: Date.now()
      });

      finalize({
        status: "completed",
        exitCode: exitCode ?? null,
        signal
      });
    });

    const timeout = setTimeout(() => {
      requestTermination(
        "timeout",
        `CLI response timed out after ${options.timeoutMs}ms`,
        "SIGTERM",
        "failed"
      );
    }, options.timeoutMs);

    if (options.signal) {
      abortHandler = doCancel;

      if (options.signal.aborted) {
        abortHandler();
      } else {
        options.signal.addEventListener("abort", abortHandler, { once: true });
      }
    }
  });

  return {
    pid: child.pid ?? -1,
    cancel() {
      cancelSession?.();
    },
    result
  };
}

export interface RunCliToCompletionOptions extends Omit<CliSpawnOptions, "requestId"> {
  requestId?: string;
}

// 목적: 단일 실행을 완료까지 기다린 뒤 이벤트 전체를 반환한다.
export async function runCliToCompletion(options: RunCliToCompletionOptions): Promise<CliEvent[]> {
  const requestId = options.requestId ?? crypto.randomUUID();
  const session = startCliSession({ ...options, requestId });
  const result = await session.result;

  if (result.status === "completed") {
    return result.events;
  }

  const message = result.error
    ?? (result.status === "cancelled"
      ? "CLI execution was cancelled"
      : result.status === "timeout"
        ? `CLI response timed out after ${options.timeoutMs}ms`
        : `CLI exited with code ${result.exitCode ?? -1}`);

  throw new CliExecutionError(message, {
    events: result.events,
    exitCode: result.exitCode,
    stderr: result.stderr,
    status: result.status
  });
}

export interface StreamCliEventsOptions extends Omit<CliSpawnOptions, "requestId"> {
  requestId?: string;
}

// 목적: 세션 이벤트를 실시간 스트리밍한다.
export async function* streamCliEvents(options: StreamCliEventsOptions): AsyncGenerator<CliEvent> {
  const requestId = options.requestId ?? crypto.randomUUID();
  const queue: CliEvent[] = [];
  let resolver: (() => void) | null = null;
  let done = false;
  let streamError: Error | null = null;

  const session = startCliSession({
    ...options,
    requestId,
    onEvent: (event) => {
      queue.push(event);
      if (resolver) {
        resolver();
        resolver = null;
      }
    }
  });

  session.result
    .then((result) => {
      done = true;
      if (result.status !== "completed") {
        const message = result.error
          ?? (result.status === "cancelled"
            ? "CLI execution was cancelled"
            : result.status === "timeout"
              ? `CLI response timed out after ${options.timeoutMs}ms`
              : `CLI exited with code ${result.exitCode ?? -1}`);
        streamError = new CliExecutionError(message, {
          events: result.events,
          exitCode: result.exitCode,
          stderr: result.stderr,
          status: result.status
        });
      }

      if (resolver) {
        resolver();
        resolver = null;
      }
    })
    .catch((error) => {
      done = true;
      streamError = error instanceof Error ? error : new Error(String(error));
      if (resolver) {
        resolver();
        resolver = null;
      }
    });

  function waitForEvent(): Promise<void> {
    if (queue.length > 0 || done) return Promise.resolve();
    return new Promise<void>((resolve) => {
      resolver = resolve;
    });
  }

  while (true) {
    await waitForEvent();

    while (queue.length > 0) {
      yield queue.shift()!;
    }

    if (done) {
      if (streamError) throw streamError;
      return;
    }
  }
}
