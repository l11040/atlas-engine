// 렌더러 → 메인: Claude CLI 실행 요청/취소 및 인증 상태 조회
export const IPC_CHANNELS = {
  claudeRun: "claude:run",
  claudeCancel: "claude:cancel",
  claudeEvent: "claude:event",
  claudeAuthStatus: "claude:auth-status"
} as const;

export type ClaudeRunStatus = "accepted" | "rejected";

export interface ClaudeRunRequest {
  requestId: string;
  prompt: string;
  cwd?: string;
}

export interface ClaudeRunResponse {
  status: ClaudeRunStatus;
  requestId: string;
  message?: string;
}

export interface ClaudeCancelRequest {
  requestId: string;
}

export interface ClaudeCancelResponse {
  status: "cancelled" | "not_found";
  requestId: string;
}

export type ClaudeAuthStatus = "authenticated" | "unauthenticated" | "cli_missing" | "error";

export interface ClaudeAuthStatusRequest {
  cwd?: string;
  timeoutMs?: number;
}

export interface ClaudeAuthStatusResponse {
  status: ClaudeAuthStatus;
  message: string;
  checkedAt: number;
}

export type ClaudeEventPhase =
  | "started"
  | "stdout"
  | "stderr"
  | "completed"
  | "failed"
  | "cancelled";

export interface ClaudeEventBase {
  requestId: string;
  phase: ClaudeEventPhase;
  timestamp: number;
}

// started: 프로세스 spawn 성공 · stdout/stderr: 스트림 청크 수신
// completed: 정상 종료(exit 0) · failed: 비정상 종료 또는 에러 · cancelled: 사용자 취소
export type ClaudeEvent =
  | (ClaudeEventBase & { phase: "started"; pid: number })
  | (ClaudeEventBase & { phase: "stdout" | "stderr"; chunk: string })
  | (ClaudeEventBase & { phase: "completed"; exitCode: number; signal: NodeJS.Signals | null })
  | (ClaudeEventBase & { phase: "failed"; error: string })
  | (ClaudeEventBase & { phase: "cancelled" });

export interface AtlasDesktopApi {
  runClaude(request: ClaudeRunRequest): Promise<ClaudeRunResponse>;
  cancelClaude(request: ClaudeCancelRequest): Promise<ClaudeCancelResponse>;
  getClaudeAuthStatus(request?: ClaudeAuthStatusRequest): Promise<ClaudeAuthStatusResponse>;
  onClaudeEvent(listener: (event: ClaudeEvent) => void): () => void;
}
