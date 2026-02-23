// 책임: Codex CLI를 CliProvider 인터페이스로 구현한다.

import { app } from "electron";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import type {
  CliAuthCheckRequest,
  CliAuthStatusResponse,
  CliAuthStatus,
  CliCancelRequest,
  CliCancelResponse,
  CliEvent,
  CliRunRequest,
  CliRunResponse
} from "../../../../shared/ipc";
import { getSettings } from "../../config/settings";
import type { CliProvider, EmitCliEvent } from "../types";
import { createJsonlParser } from "./jsonl-parser";
import { createCodexNormalizer } from "./normalizer";

type CodexChildProcess = ChildProcessByStdio<null, Readable, Readable>;
const runningJobs = new Map<string, CodexChildProcess>();

const DEBUG = process.env.ATLAS_DEBUG_CODEX === "1";
function log(...args: unknown[]) {
  if (!DEBUG) return;
  console.log("[codex-provider]", ...args);
}

// ─── Run ────────────────────────────────────────────────

function run(target: Electron.WebContents, request: CliRunRequest, emit: EmitCliEvent): CliRunResponse {
  if (!request.requestId || !request.prompt.trim()) {
    return { status: "rejected", requestId: request.requestId, message: "requestId와 prompt는 필수입니다" };
  }

  if (runningJobs.has(request.requestId)) {
    return { status: "rejected", requestId: request.requestId, message: "해당 requestId가 이미 실행 중입니다" };
  }

  const settings = getSettings();

  // 주의: stdin을 ignore로 고정해 CLI가 입력 대기 상태로 멈추는 현상을 방지한다.
  // 목적: 공통 permissionMode를 Codex CLI의 실행 옵션으로 매핑한다.
  const args = ["exec", "--json", "--skip-git-repo-check"];
  if (settings.cli.permissionMode === "auto") {
    args.push("--full-auto");
  }
  args.push(request.prompt);

  const child = spawn(
    "codex",
    args,
    {
      cwd: request.cwd || settings.defaultCwd || process.cwd() || app.getPath("home"),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  runningJobs.set(request.requestId, child);

  emit(target, {
    requestId: request.requestId,
    provider: "codex",
    phase: "started",
    pid: child.pid ?? -1,
    timestamp: Date.now()
  });

  let stderr = "";
  let settled = false;

  // 목적: 세션별 상태 기반 normalizer를 생성하여 item.started/completed 간 ID를 추적한다.
  const normalizeCodexEvent = createCodexNormalizer();

  const parser = createJsonlParser(
    (rawEvent) => {
      for (const event of normalizeCodexEvent(request.requestId, rawEvent)) {
        emit(target, event);
      }
    },
    (rawLine, error) => {
      console.warn("[codex-provider] JSONL 파싱 실패:", rawLine.slice(0, 200), error.message);
    }
  );

  child.stdout.on("data", (chunk) => {
    parser.feed(chunk.toString());
  });

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    emit(target, {
      requestId: request.requestId,
      provider: "codex",
      phase: "stderr",
      chunk: text,
      timestamp: Date.now()
    });
  });

  const timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    runningJobs.delete(request.requestId);
    child.kill("SIGTERM");
    emit(target, {
      requestId: request.requestId,
      provider: "codex",
      phase: "failed",
      error: "Codex response timed out",
      timestamp: Date.now()
    });
  }, settings.cli.timeoutMs);

  child.once("error", (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    runningJobs.delete(request.requestId);

    const friendlyError =
      (error as NodeJS.ErrnoException).code === "ENOENT" ? "codex command was not found in PATH" : error.message;

    emit(target, {
      requestId: request.requestId,
      provider: "codex",
      phase: "failed",
      error: friendlyError,
      timestamp: Date.now()
    });
  });

  child.once("close", (exitCode, signal) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    parser.flush();

    if (!runningJobs.has(request.requestId)) return;
    runningJobs.delete(request.requestId);

    if ((exitCode ?? 0) !== 0) {
      emit(target, {
        requestId: request.requestId,
        provider: "codex",
        phase: "failed",
        error: stderr.trim() || `Codex exited with code ${exitCode ?? -1}`,
        timestamp: Date.now()
      });
      return;
    }

    emit(target, {
      requestId: request.requestId,
      provider: "codex",
      phase: "completed",
      exitCode: exitCode ?? -1,
      signal,
      timestamp: Date.now()
    });
  });

  return { status: "accepted", requestId: request.requestId };
}

// ─── Cancel ─────────────────────────────────────────────

function cancel(target: Electron.WebContents, request: CliCancelRequest, emit: EmitCliEvent): CliCancelResponse {
  const running = runningJobs.get(request.requestId);
  if (!running) {
    return { status: "not_found", requestId: request.requestId };
  }

  runningJobs.delete(request.requestId);
  running.kill("SIGTERM");

  emit(target, {
    requestId: request.requestId,
    provider: "codex",
    phase: "cancelled",
    timestamp: Date.now()
  });

  return { status: "cancelled", requestId: request.requestId };
}

// ─── Auth ───────────────────────────────────────────────

function makeAuthResponse(status: CliAuthStatus, message: string): CliAuthStatusResponse {
  return { provider: "codex", status, message, checkedAt: Date.now() };
}

// 목적: 1단계 - ~/.codex/auth.json 존재 여부로 인증 여부를 빠르게 판별한다.
async function checkLocalAuth(home: string): Promise<CliAuthStatusResponse | null> {
  try {
    await access(path.join(home, ".codex", "auth.json"));
    return makeAuthResponse("authenticated", "Codex CLI 사용 가능, 인증 완료");
  } catch {
    // 이유: 파일이 없으면 환경변수 + 런타임 체크로 넘어간다.
  }
  return null;
}

// 목적: 2단계 - 환경변수와 CLI 존재 여부로 인증 상태를 판별한다.
function runRuntimeCheck(timeoutMs: number): Promise<CliAuthStatusResponse> {
  log("auth check start", { timeoutMs });

  return new Promise((resolve) => {
    const child = spawn("codex", ["--version"], { shell: false, stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let settled = false;

    const complete = (response: CliAuthStatusResponse) => {
      if (settled) return;
      settled = true;
      resolve(response);
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      complete(makeAuthResponse("error", "Codex 인증 확인 시간 초과"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.once("error", (error) => {
      clearTimeout(timer);
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        log("auth check cli missing");
        complete(makeAuthResponse("cli_missing", "codex 명령어를 PATH에서 찾을 수 없음"));
        return;
      }
      complete(makeAuthResponse("error", error.message));
    });

    child.once("close", (exitCode) => {
      clearTimeout(timer);

      if (exitCode !== 0) {
        complete(makeAuthResponse("error", `Codex CLI 확인 실패 (종료 코드 ${exitCode ?? -1})`));
        return;
      }

      // 목적: CLI는 존재하므로 환경변수로 인증 여부를 판별한다.
      const hasKey = !!(process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY);
      if (hasKey) {
        log("auth check authenticated via env key");
        complete(makeAuthResponse("authenticated", "Codex CLI 사용 가능, 인증 완료"));
      } else {
        log("auth check unauthenticated");
        complete(makeAuthResponse("unauthenticated", "Codex CLI 설치됨, 로그인 필요"));
      }
    });
  });
}

async function checkAuth(request: CliAuthCheckRequest): Promise<CliAuthStatusResponse> {
  const timeoutMs = request.timeoutMs ?? 10000;
  const home = app.getPath("home");

  const localResult = await checkLocalAuth(home);
  if (localResult) return localResult;

  return runRuntimeCheck(timeoutMs);
}

// ─── Export ─────────────────────────────────────────────

export const codexProvider: CliProvider = { run, cancel, checkAuth };
