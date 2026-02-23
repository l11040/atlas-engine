// 책임: Claude CLI를 CliProvider 인터페이스로 구현한다.

import { app } from "electron";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
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
import { normalizeStreamJsonEvent } from "./normalizer";
import { createStreamJsonParser } from "./stream-json-parser";

type ClaudeChildProcess = ChildProcessByStdio<null, Readable, Readable>;
const runningJobs = new Map<string, ClaudeChildProcess>();

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

  // 주의: stdin을 ignore로 고정해 CLI가 입력 대기 상태로 멈추는 현상을 방지한다.
  const child = spawn(
    "claude",
    // 목적: 공통 permissionMode를 Claude CLI의 --permission-mode 플래그로 매핑한다.
    ["-p", request.prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", settings.cli.permissionMode === "auto" ? "bypassPermissions" : "default"],
    {
      // 목적: cwd 폴백 체인 — 요청값 → 설정값 → process.cwd() → 홈 디렉토리
      cwd: request.cwd || settings.defaultCwd || process.cwd() || app.getPath("home"),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  runningJobs.set(request.requestId, child);

  emit(target, {
    requestId: request.requestId,
    provider: "claude",
    phase: "started",
    pid: child.pid ?? -1,
    timestamp: Date.now()
  });

  let stderr = "";
  let settled = false;

  const parser = createStreamJsonParser(
    (rawEvent) => {
      // 목적: stream-json 이벤트를 정규화하여 렌더러에 전달한다.
      for (const event of normalizeStreamJsonEvent(request.requestId, rawEvent)) {
        emit(target, event);
      }
    },
    (rawLine, error) => {
      console.warn("[claude-provider] stream-json 파싱 실패:", rawLine.slice(0, 200), error.message);
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
      provider: "claude",
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
    emit(target, {
      requestId: request.requestId,
      provider: "claude",
      phase: "failed",
      error: "Claude response timed out",
      timestamp: Date.now()
    });
  }, settings.cli.timeoutMs);

  child.once("error", (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    runningJobs.delete(request.requestId);

    const friendlyError =
      (error as NodeJS.ErrnoException).code === "ENOENT" ? "claude command was not found in PATH" : error.message;

    emit(target, {
      requestId: request.requestId,
      provider: "claude",
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
      emit(target, {
        requestId: request.requestId,
        provider: "claude",
        phase: "failed",
        error: stderr.trim() || `Claude exited with code ${exitCode ?? -1}`,
        timestamp: Date.now()
      });
      return;
    }

    emit(target, {
      requestId: request.requestId,
      provider: "claude",
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
    provider: "claude",
    phase: "cancelled",
    timestamp: Date.now()
  });

  return { status: "cancelled", requestId: request.requestId };
}

// ─── Auth ───────────────────────────────────────────────

function makeAuthResponse(status: CliAuthStatus, message: string): CliAuthStatusResponse {
  return { provider: "claude", status, message, checkedAt: Date.now() };
}

function hasLikelyAuthPayload(raw: string): boolean {
  const lowered = raw.toLowerCase();
  return (
    lowered.includes("apikey") ||
    lowered.includes("api_key") ||
    lowered.includes("oauth") ||
    lowered.includes("auth_token") ||
    lowered.includes("access_token")
  );
}

// 목적: 1단계 - 로컬 인증 설정 파일에서 토큰 존재 여부를 확인한다. (프로세스 불필요)
async function checkLocalAuthFile(home: string): Promise<CliAuthStatusResponse | null> {
  try {
    const claudeJson = path.join(home, ".claude.json");
    await access(claudeJson);
    const raw = await readFile(claudeJson, "utf8");
    if (hasLikelyAuthPayload(raw)) {
      return makeAuthResponse("authenticated", "Claude CLI 사용 가능, 인증 완료");
    }
  } catch {
    // 이유: 파일이 없거나 읽기 실패 시 런타임 체크로 넘어간다.
  }
  return null;
}

// 목적: 2단계 - 경량 프롬프트 실행으로 CLI 존재 여부와 인증 상태를 동시에 판별한다.
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
  const home = app.getPath("home");

  // 목적: 1단계 - 파일 기반 fast path (프로세스 spawn 없이 확인)
  const localResult = await checkLocalAuthFile(home);
  if (localResult) return localResult;

  // 목적: 2단계 - 런타임 체크 (CLI 존재 + 인증 상태를 한 번에 확인)
  return runRuntimeCheck(cwd, timeoutMs);
}

// ─── Export ─────────────────────────────────────────────

export const claudeProvider: CliProvider = { run, cancel, checkAuth };
