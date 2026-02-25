// 책임: CLI 프로세스를 spawn하고 정규화된 CliEvent를 Promise 또는 AsyncGenerator로 반환한다.
// 이유: 기존 CliProvider는 WebContents/IPC에 결합되어 있어 LangChain에서 재사용이 불가하다.

import { spawn } from "node:child_process";
import type { CliEvent, CliPermissionMode, ProviderType } from "../../../shared/ipc";
import { createStreamJsonParser } from "../providers/claude/stream-json-parser";
import { normalizeStreamJsonEvent } from "../providers/claude/normalizer";
import { createJsonlParser } from "../providers/codex/jsonl-parser";
import { createCodexNormalizer } from "../providers/codex/normalizer";

export interface CliSpawnOptions {
  provider: ProviderType;
  prompt: string;
  cwd: string;
  permissionMode: CliPermissionMode;
  timeoutMs: number;
  signal?: AbortSignal;
}

// 목적: provider에 따라 CLI 실행 명령어와 인자를 결정한다.
function buildCommand(options: CliSpawnOptions): { command: string; args: string[] } {
  if (options.provider === "claude") {
    // 주의: --allowedTools ""로 도구 사용을 차단하여 파일 생성 등 side effect를 방지한다.
    // 이유: CliLlm은 텍스트 응답만 필요하므로 agent 기능이 불필요하다.
    return {
      command: "claude",
      args: [
        "-p", options.prompt,
        "--output-format", "stream-json",
        "--verbose",
        "--allowedTools", ""
      ]
    };
  }

  // Codex
  const args = ["exec", "--json", "--skip-git-repo-check"];
  if (options.permissionMode === "auto") {
    args.push("--full-auto");
  }
  args.push(options.prompt);
  return { command: "codex", args };
}

// 목적: provider에 따라 적절한 파서를 생성하고 정규화된 CliEvent를 콜백으로 전달한다.
function createParserForProvider(
  provider: ProviderType,
  requestId: string,
  onEvent: (event: CliEvent) => void
) {
  if (provider === "claude") {
    return createStreamJsonParser(
      (rawEvent) => {
        for (const event of normalizeStreamJsonEvent(requestId, rawEvent)) {
          onEvent(event);
        }
      },
      (rawLine, error) => {
        console.warn("[cli-spawn-runner] stream-json 파싱 실패:", rawLine.slice(0, 200), error.message);
      }
    );
  }

  // 목적: 세션별 상태 기반 normalizer를 생성하여 item.started/completed 간 ID를 추적한다.
  const normalizeCodexEvent = createCodexNormalizer();

  return createJsonlParser(
    (rawEvent) => {
      for (const event of normalizeCodexEvent(requestId, rawEvent)) {
        onEvent(event);
      }
    },
    (rawLine, error) => {
      console.warn("[cli-spawn-runner] JSONL 파싱 실패:", rawLine.slice(0, 200), error.message);
    }
  );
}

// 목적: CLI를 실행하고 모든 CliEvent를 수집하여 배열로 반환한다. (invoke 용)
export function runCliToCompletion(options: CliSpawnOptions): Promise<CliEvent[]> {
  const requestId = crypto.randomUUID();
  const { command, args } = buildCommand(options);
  const events: CliEvent[] = [];

  return new Promise((resolve, reject) => {
    // 주의: stdin을 ignore로 고정해 CLI가 입력 대기 상태로 멈추는 현상을 방지한다.
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    let settled = false;

    const parser = createParserForProvider(options.provider, requestId, (event) => {
      events.push(event);
    });

    child.stdout.on("data", (chunk) => {
      parser.feed(chunk.toString());
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`CLI response timed out after ${options.timeoutMs}ms`));
    }, options.timeoutMs);

    // 목적: AbortSignal을 통한 외부 취소를 지원한다.
    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        child.kill("SIGTERM");
        reject(new Error("CLI execution was cancelled"));
      }, { once: true });
    }

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      const friendlyError =
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? `${command} command was not found in PATH`
          : error.message;

      reject(new Error(friendlyError));
    });

    child.once("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      parser.flush();

      if ((exitCode ?? 0) !== 0) {
        reject(new Error(stderr.trim() || `CLI exited with code ${exitCode ?? -1}`));
        return;
      }

      resolve(events);
    });
  });
}

// 목적: CLI를 실행하고 CliEvent를 하나씩 yield한다. (stream 용)
export async function* streamCliEvents(options: CliSpawnOptions): AsyncGenerator<CliEvent> {
  const requestId = crypto.randomUUID();
  const { command, args } = buildCommand(options);

  // 이유: 콜백 기반 파서와 AsyncGenerator를 연결하기 위해 큐/리졸버 패턴을 사용한다.
  const queue: CliEvent[] = [];
  let resolver: (() => void) | null = null;
  let done = false;
  let error: Error | null = null;

  function pushEvent(event: CliEvent) {
    queue.push(event);
    if (resolver) {
      resolver();
      resolver = null;
    }
  }

  function waitForEvent(): Promise<void> {
    if (queue.length > 0 || done) return Promise.resolve();
    return new Promise<void>((r) => {
      resolver = r;
    });
  }

  const child = spawn(command, args, {
    cwd: options.cwd,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";

  const parser = createParserForProvider(options.provider, requestId, pushEvent);

  child.stdout.on("data", (chunk) => {
    parser.feed(chunk.toString());
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const timeout = setTimeout(() => {
    if (done) return;
    done = true;
    child.kill("SIGTERM");
    error = new Error(`CLI response timed out after ${options.timeoutMs}ms`);
    if (resolver) {
      resolver();
      resolver = null;
    }
  }, options.timeoutMs);

  if (options.signal) {
    options.signal.addEventListener("abort", () => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      child.kill("SIGTERM");
      error = new Error("CLI execution was cancelled");
      if (resolver) {
        resolver();
        resolver = null;
      }
    }, { once: true });
  }

  child.once("error", (err) => {
    clearTimeout(timeout);
    done = true;
    const friendlyError =
      (err as NodeJS.ErrnoException).code === "ENOENT"
        ? `${command} command was not found in PATH`
        : err.message;
    error = new Error(friendlyError);
    if (resolver) {
      resolver();
      resolver = null;
    }
  });

  child.once("close", (exitCode) => {
    clearTimeout(timeout);
    parser.flush();
    done = true;

    if ((exitCode ?? 0) !== 0) {
      error = new Error(stderr.trim() || `CLI exited with code ${exitCode ?? -1}`);
    }

    if (resolver) {
      resolver();
      resolver = null;
    }
  });

  // 목적: 큐에 쌓인 이벤트를 순서대로 yield하고 프로세스 종료 시 루프를 탈출한다.
  while (true) {
    await waitForEvent();

    while (queue.length > 0) {
      yield queue.shift()!;
    }

    if (done) {
      if (error) throw error;
      return;
    }
  }
}
