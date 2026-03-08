// 책임: Claude CLI를 CliProvider 인터페이스로 구현한다.

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

const DEBUG = process.env.ATLAS_DEBUG_CLAUDE === "1";
function log(...args: unknown[]) {
  if (!DEBUG) return;
  console.log("[claude-provider]", ...args);
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
    provider: "claude",
    prompt: request.prompt,
    // 목적: cwd 폴백 체인 — 요청값 → 설정값 → process.cwd() → 홈 디렉토리
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
      console.warn("[claude-provider] stream-json 파싱 실패:", rawLine.slice(0, 200), error.message);
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
  return { provider: "claude", status, message, checkedAt: Date.now() };
}

// 목적: 경량 프롬프트 실행으로 CLI 존재 여부와 인증 상태를 동시에 판별한다.
function runRuntimeCheck(cwd: string, timeoutMs: number): Promise<CliAuthStatusResponse> {
  log("auth check start", { cwd, timeoutMs });

  return new Promise((resolve) => {
    // 주의: stdin을 ignore로 고정해 CLI가 입력 대기 상태로 멈추는 현상을 방지한다.
    // 주의: bypassPermissions로 권한 프롬프트를 건너뛴다.
    const child = spawn(
      "claude",
      ["-p", "Reply with OK only.", "--output-format", "text", "--permission-mode", "bypassPermissions"],
      { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] }
    );

    let stdout = "";
    let stderrBuf = "";
    let settled = false;

    const complete = (response: CliAuthStatusResponse) => {
      if (settled) return;
      settled = true;
      resolve(response);
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      complete(makeAuthResponse("error", "Claude 인증 확인 시간 초과"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderrBuf += chunk.toString();
    });

    child.once("error", (error) => {
      clearTimeout(timer);
      const code = (error as NodeJS.ErrnoException).code;

      if (code === "ENOENT") {
        log("auth check cli missing");
        complete(makeAuthResponse("cli_missing", "claude 명령어를 PATH에서 찾을 수 없음"));
        return;
      }
      if (code === "EPERM" || code === "EACCES") {
        log("auth check permission error");
        complete(makeAuthResponse("error", "Claude CLI 설정 파일 접근 불가, 권한을 확인하세요"));
        return;
      }

      log("auth check error", { error: error.message });
      complete(makeAuthResponse("error", error.message));
    });

    child.once("close", (exitCode) => {
      clearTimeout(timer);

      if (exitCode === 0) {
        log("auth check authenticated");
        complete(makeAuthResponse("authenticated", "Claude CLI 사용 가능, 인증 완료"));
        return;
      }

      const combined = `${stdout}\n${stderrBuf}`.toLowerCase();

      if (
        combined.includes("login") ||
        combined.includes("not authenticated") ||
        combined.includes("authentication") ||
        combined.includes("setup-token")
      ) {
        log("auth check unauthenticated");
        complete(makeAuthResponse("unauthenticated", "Claude CLI 설치됨, 로그인 필요"));
        return;
      }

      if (combined.includes("not found")) {
        log("auth check cli missing from output");
        complete(makeAuthResponse("cli_missing", "claude 명령어를 PATH에서 찾을 수 없음"));
        return;
      }

      log("auth check failed", { exitCode });
      complete(makeAuthResponse("error", stderrBuf.trim() || stdout.trim() || `Claude CLI 확인 실패 (종료 코드 ${exitCode ?? -1})`));
    });
  });
}

async function checkAuth(request: CliAuthCheckRequest): Promise<CliAuthStatusResponse> {
  const timeoutMs = request.timeoutMs ?? 15000;
  const cwd = request.cwd || process.cwd() || app.getPath("home");
  // 목적: 파일 존재 기반 휴리스틱 대신 런타임 체크를 단일 소스로 사용한다.
  return runRuntimeCheck(cwd, timeoutMs);
}

// ─── Export ─────────────────────────────────────────────

export const claudeProvider: CliProvider = { run, cancel, checkAuth };
