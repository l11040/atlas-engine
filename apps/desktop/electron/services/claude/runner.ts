import { app, type BrowserWindow, type WebContents } from "electron";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import {
  IPC_CHANNELS,
  type ClaudeCancelRequest,
  type ClaudeCancelResponse,
  type ClaudeEvent,
  type ClaudeRunRequest,
  type ClaudeRunResponse,
  type StreamJsonResult
} from "../../../shared/ipc";
import { getSettings } from "../config/settings";
import { createStreamJsonParser } from "./stream-json-parser";

type ClaudeChildProcess = ChildProcessByStdio<null, Readable, Readable>;
const runningJobs = new Map<string, ClaudeChildProcess>();

type EventTarget = BrowserWindow | WebContents | null;

function emitClaudeEvent(target: EventTarget, event: ClaudeEvent) {
  // 목적: IPC 이벤트를 호출한 렌더러(webContents)로만 되돌려준다.
  if (!target) return;
  if ("webContents" in target) {
    if (target.isDestroyed() || target.webContents.isDestroyed()) return;
    target.webContents.send(IPC_CHANNELS.claudeEvent, event);
    return;
  }
  if (target.isDestroyed()) return;
  target.send(IPC_CHANNELS.claudeEvent, event);
}

export function runClaude(target: EventTarget, request: ClaudeRunRequest): ClaudeRunResponse {
  if (!request.requestId || !request.prompt.trim()) {
    return {
      status: "rejected",
      requestId: request.requestId,
      message: "requestId and prompt are required"
    };
  }

  if (runningJobs.has(request.requestId)) {
    return {
      status: "rejected",
      requestId: request.requestId,
      message: "requestId is already running"
    };
  }

  const settings = getSettings();

  // 주의: stdin을 ignore로 고정해 CLI가 입력 대기 상태로 멈추는 현상을 방지한다.
  const child = spawn(
    "claude",
    [
      "-p",
      request.prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-mode",
      settings.claude.permissionMode
    ],
    {
      // 목적: cwd 폴백 체인 — 요청값 → 설정값 → process.cwd() → 홈 디렉토리
      cwd: request.cwd || settings.defaultCwd || process.cwd() || app.getPath("home"),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  runningJobs.set(request.requestId, child);

  emitClaudeEvent(target, {
    requestId: request.requestId,
    phase: "started",
    pid: child.pid ?? -1,
    timestamp: Date.now()
  });

  let stderr = "";
  let settled = false;
  // 목적: result 이벤트를 보존하여 completed 이벤트에 비용/시간 정보를 포함시킨다.
  let lastResult: StreamJsonResult | null = null;

  const parser = createStreamJsonParser(
    (event) => {
      if (event.type === "result") {
        lastResult = event as StreamJsonResult;
      }
      emitClaudeEvent(target, {
        requestId: request.requestId,
        phase: "stream-event",
        event,
        timestamp: Date.now()
      });
    },
    (rawLine, error) => {
      console.warn("[claude-runner] stream-json 파싱 실패:", rawLine.slice(0, 200), error.message);
    }
  );

  child.stdout.on("data", (chunk) => {
    parser.feed(chunk.toString());
  });

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    emitClaudeEvent(target, {
      requestId: request.requestId,
      phase: "stderr",
      chunk: text,
      timestamp: Date.now()
    });
  });

  // 이유: 다단계 tool 사용 세션은 오래 걸리므로 설정값 기준 타임아웃을 적용한다.
  const timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    runningJobs.delete(request.requestId);
    child.kill("SIGTERM");
    emitClaudeEvent(target, {
      requestId: request.requestId,
      phase: "failed",
      error: "Claude response timed out",
      timestamp: Date.now()
    });
  }, settings.claude.timeoutMs);

  child.once("error", (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    runningJobs.delete(request.requestId);

    const friendlyError =
      (error as NodeJS.ErrnoException).code === "ENOENT" ? "claude command was not found in PATH" : error.message;

    emitClaudeEvent(target, {
      requestId: request.requestId,
      phase: "failed",
      error: friendlyError,
      timestamp: Date.now()
    });
  });

  child.once("close", (exitCode, signal) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    // 목적: 프로세스 종료 시 버퍼에 남은 마지막 줄을 처리한다.
    parser.flush();

    if (!runningJobs.has(request.requestId)) return;
    runningJobs.delete(request.requestId);

    if ((exitCode ?? 0) !== 0) {
      // 주의: 비정상 종료는 completed가 아니라 failed로 정규화한다.
      emitClaudeEvent(target, {
        requestId: request.requestId,
        phase: "failed",
        error: stderr.trim() || `Claude exited with code ${exitCode ?? -1}`,
        timestamp: Date.now()
      });
      return;
    }

    emitClaudeEvent(target, {
      requestId: request.requestId,
      phase: "completed",
      exitCode: exitCode ?? -1,
      signal,
      costUsd: lastResult?.cost_usd,
      durationMs: lastResult?.duration_ms,
      timestamp: Date.now()
    });
  });

  return { status: "accepted", requestId: request.requestId };
}

export function cancelClaude(target: EventTarget, request: ClaudeCancelRequest): ClaudeCancelResponse {
  const running = runningJobs.get(request.requestId);
  if (!running) {
    return { status: "not_found", requestId: request.requestId };
  }

  runningJobs.delete(request.requestId);
  running.kill("SIGTERM");

  emitClaudeEvent(target, {
    requestId: request.requestId,
    phase: "cancelled",
    timestamp: Date.now()
  });

  return { status: "cancelled", requestId: request.requestId };
}
