import { app } from "electron";
import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { ClaudeAuthStatus, ClaudeAuthStatusRequest, ClaudeAuthStatusResponse } from "../../../shared/ipc";

const DEBUG_CLAUDE = process.env.ATLAS_DEBUG_CLAUDE === "1";

function log(...args: unknown[]) {
  if (!DEBUG_CLAUDE) return;
  console.log("[claude-auth]", ...args);
}

function makeResponse(status: ClaudeAuthStatus, message: string): ClaudeAuthStatusResponse {
  return { status, message, checkedAt: Date.now() };
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
async function checkLocalAuthFile(home: string): Promise<ClaudeAuthStatusResponse | null> {
  try {
    const claudeJson = path.join(home, ".claude.json");
    await access(claudeJson);
    const raw = await readFile(claudeJson, "utf8");
    if (hasLikelyAuthPayload(raw)) {
      return makeResponse("authenticated", "Claude CLI is installed and local auth config was found");
    }
  } catch {
    // 이유: 파일이 없거나 읽기 실패 시 런타임 체크로 넘어간다.
  }
  return null;
}

// 목적: 2단계 - 경량 프롬프트 실행으로 CLI 존재 여부와 인증 상태를 동시에 판별한다.
function runRuntimeCheck(cwd: string, timeoutMs: number): Promise<ClaudeAuthStatusResponse> {
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
    let stderr = "";
    let settled = false;

    const complete = (response: ClaudeAuthStatusResponse) => {
      if (settled) return;
      settled = true;
      resolve(response);
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      complete(makeResponse("error", "Claude auth check timed out"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.once("error", (error) => {
      clearTimeout(timer);
      const code = (error as NodeJS.ErrnoException).code;

      if (code === "ENOENT") {
        log("auth check cli missing");
        complete(makeResponse("cli_missing", "claude command was not found in PATH"));
        return;
      }
      if (code === "EPERM" || code === "EACCES") {
        log("auth check permission error");
        complete(makeResponse("error", "Claude CLI cannot access local config files. Check filesystem permissions."));
        return;
      }

      log("auth check error", { error: error.message });
      complete(makeResponse("error", error.message));
    });

    child.once("close", (exitCode) => {
      clearTimeout(timer);

      if (exitCode === 0) {
        log("auth check authenticated");
        complete(makeResponse("authenticated", "Claude CLI is available and authenticated"));
        return;
      }

      const combined = `${stdout}\n${stderr}`.toLowerCase();

      if (
        combined.includes("login") ||
        combined.includes("not authenticated") ||
        combined.includes("authentication") ||
        combined.includes("setup-token")
      ) {
        log("auth check unauthenticated");
        complete(makeResponse("unauthenticated", "Claude CLI is installed, but login is required"));
        return;
      }

      if (combined.includes("not found")) {
        log("auth check cli missing from output");
        complete(makeResponse("cli_missing", "claude command was not found in PATH"));
        return;
      }

      log("auth check failed", { exitCode });
      complete(makeResponse("error", stderr.trim() || stdout.trim() || `Claude check failed (exit ${exitCode ?? -1})`));
    });
  });
}

export async function checkClaudeAuthStatus(request?: ClaudeAuthStatusRequest): Promise<ClaudeAuthStatusResponse> {
  const timeoutMs = request?.timeoutMs ?? 15000;
  const cwd = request?.cwd || process.cwd() || app.getPath("home");
  const home = app.getPath("home");

  // 목적: 1단계 - 파일 기반 fast path (프로세스 spawn 없이 확인)
  const localResult = await checkLocalAuthFile(home);
  if (localResult) return localResult;

  // 목적: 2단계 - 런타임 체크 (CLI 존재 + 인증 상태를 한 번에 확인)
  return runRuntimeCheck(cwd, timeoutMs);
}
