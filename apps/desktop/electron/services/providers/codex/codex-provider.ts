// 책임: Codex CLI를 CliProvider 인터페이스로 구현한다.

import { app } from "electron";
import { spawn } from "node:child_process";
import { startCliSession, type CliSessionHandle } from "@atlas/cli-runtime";
import type {
  CliAuthCheckRequest,
  CliAuthStatusResponse,
  CliAuthStatus,
  CliCancelRequest,
  CliCancelResponse,
  CliRunRequest,
  CliRunResponse
} from "../../../../shared/ipc";
import { getSettings } from "../../config/settings";
import type { CliProvider, EmitCliEvent } from "../types";
import { toIpcCliEvent } from "../cli-event-adapter";

const runningJobs = new Map<string, CliSessionHandle>();

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
  const session = startCliSession({
    requestId: request.requestId,
    provider: "codex",
    prompt: request.prompt,
    cwd: request.cwd || settings.defaultCwd || process.cwd() || app.getPath("home"),
    permissionMode: settings.cli.permissionMode,
    timeoutMs: settings.cli.timeoutMs,
    conversation: request.conversation,
    promptTransport: "auto",
    // 이유: 사용자 실행 세션은 도구 사용이 기본 요구사항이다.
    allowTools: true,
    onEvent: (event) => {
      emit(target, toIpcCliEvent(event));
    },
    onParseError: ({ rawLine, error }) => {
      console.warn("[codex-provider] JSONL 파싱 실패:", rawLine.slice(0, 200), error.message);
    }
  });

  runningJobs.set(request.requestId, session);
  void session.result.finally(() => {
    runningJobs.delete(request.requestId);
  });

  return { status: "accepted", requestId: request.requestId };
}

// ─── Cancel ─────────────────────────────────────────────

function cancel(_target: Electron.WebContents, request: CliCancelRequest, _emit: EmitCliEvent): CliCancelResponse {
  const running = runningJobs.get(request.requestId);
  if (!running) {
    return { status: "not_found", requestId: request.requestId };
  }

  runningJobs.delete(request.requestId);
  // 목적: 취소 이벤트 발행은 core runtime에서 수행한다.
  running.cancel();

  return { status: "cancelled", requestId: request.requestId };
}

// ─── Auth ───────────────────────────────────────────────

function makeAuthResponse(status: CliAuthStatus, message: string): CliAuthStatusResponse {
  return { provider: "codex", status, message, checkedAt: Date.now() };
}

interface AuthCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError?: NodeJS.ErrnoException;
}

function runAuthCommand(args: string[], timeoutMs: number): Promise<AuthCommandResult> {
  return new Promise((resolve) => {
    const child = spawn("codex", args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: AuthCommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ exitCode: null, stdout, stderr, timedOut: true });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.once("error", (error) => {
      finish({
        exitCode: null,
        stdout,
        stderr,
        timedOut: false,
        spawnError: error as NodeJS.ErrnoException
      });
    });

    child.once("close", (exitCode) => {
      finish({ exitCode: exitCode ?? null, stdout, stderr, timedOut: false });
    });
  });
}

function classifyLoginStatus(raw: string): "authenticated" | "unauthenticated" | "unknown" {
  const lowered = raw.toLowerCase();
  if (lowered.includes("logged in")) return "authenticated";
  if (lowered.includes("not logged in") || lowered.includes("log in")) return "unauthenticated";
  return "unknown";
}

// 목적: codex login status로 인증 여부를 판별한다.
async function runRuntimeCheck(timeoutMs: number): Promise<CliAuthStatusResponse> {
  log("auth check start", { timeoutMs });
  const result = await runAuthCommand(["login", "status"], timeoutMs);

  if (result.timedOut) {
    return makeAuthResponse("error", "Codex 인증 확인 시간 초과");
  }

  if (result.spawnError) {
    if (result.spawnError.code === "ENOENT") {
      log("auth check cli missing");
      return makeAuthResponse("cli_missing", "codex 명령어를 PATH에서 찾을 수 없음");
    }
    return makeAuthResponse("error", result.spawnError.message);
  }

  const combined = `${result.stdout}\n${result.stderr}`;
  const status = classifyLoginStatus(combined);
  if (status === "authenticated") {
    return makeAuthResponse("authenticated", "Codex CLI 사용 가능, 인증 완료");
  }
  if (status === "unauthenticated") {
    return makeAuthResponse("unauthenticated", "Codex CLI 설치됨, 로그인 필요");
  }

  if ((result.exitCode ?? 0) === 0) {
    // 이유: 출력 형식이 바뀌어도 login status가 성공 종료면 인증된 것으로 간주한다.
    return makeAuthResponse("authenticated", "Codex CLI 사용 가능, 인증 완료");
  }

  return makeAuthResponse(
    "error",
    result.stderr.trim() || result.stdout.trim() || `Codex 인증 상태 확인 실패 (종료 코드 ${result.exitCode ?? -1})`
  );
}

async function checkAuth(request: CliAuthCheckRequest): Promise<CliAuthStatusResponse> {
  const timeoutMs = request.timeoutMs ?? 10000;
  return runRuntimeCheck(timeoutMs);
}

// ─── Export ─────────────────────────────────────────────

export const codexProvider: CliProvider = { run, cancel, checkAuth };
