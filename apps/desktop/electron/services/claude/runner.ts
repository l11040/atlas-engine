import { app, type BrowserWindow, type WebContents } from "electron";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import {
  IPC_CHANNELS,
  type ClaudeCancelRequest,
  type ClaudeCancelResponse,
  type ClaudeEvent,
  type ClaudeRunRequest,
  type ClaudeRunResponse
} from "../../../shared/ipc";

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

  // 주의: stdin을 ignore로 고정해 CLI가 입력 대기 상태로 멈추는 현상을 방지한다.
  const child = spawn(
    "claude",
    ["-p", request.prompt, "--output-format", "text", "--permission-mode", "bypassPermissions"],
    {
      cwd: request.cwd || process.cwd() || app.getPath("home"),
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

  let stdout = "";
  let stderr = "";
  let settled = false;

  const timeout = setTimeout(() => {
    // 목적: 장시간 무응답일 때 프로세스를 종료하고 실패 이벤트를 보낸다.
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
  }, 60000);

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    emitClaudeEvent(target, {
      requestId: request.requestId,
      phase: "stdout",
      chunk: text,
      timestamp: Date.now()
    });
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

  child.once("error", (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    runningJobs.delete(request.requestId);

    const friendlyError =
      (error as NodeJS.ErrnoException).code === "ENOENT"
        ? "claude command was not found in PATH"
        : error.message;

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

    if (!runningJobs.has(request.requestId)) return;
    runningJobs.delete(request.requestId);

    if ((exitCode ?? 0) !== 0) {
      // 주의: 비정상 종료는 completed가 아니라 failed로 정규화한다.
      emitClaudeEvent(target, {
        requestId: request.requestId,
        phase: "failed",
        error: stderr.trim() || stdout.trim() || `Claude exited with code ${exitCode ?? -1}`,
        timestamp: Date.now()
      });
      return;
    }

    emitClaudeEvent(target, {
      requestId: request.requestId,
      phase: "completed",
      exitCode: exitCode ?? -1,
      signal,
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
