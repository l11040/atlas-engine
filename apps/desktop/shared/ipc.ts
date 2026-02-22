// 렌더러 → 메인: Claude CLI 실행 요청/취소, 인증 상태 조회, git diff 조회
export const IPC_CHANNELS = {
  claudeRun: "claude:run",
  claudeCancel: "claude:cancel",
  claudeEvent: "claude:event",
  claudeAuthStatus: "claude:auth-status",
  claudeGitDiff: "claude:git-diff"
} as const;

// ─── Claude Run ─────────────────────────────────────────

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

// ─── Claude Auth ────────────────────────────────────────

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

// ─── Stream JSON ────────────────────────────────────────
// 목적: Claude Code CLI --output-format stream-json 출력의 구조화된 타입을 정의한다.

export interface StreamJsonSystemInit {
  type: "system";
  subtype: "init";
  session_id: string;
  tools: string[];
}

export interface StreamJsonToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface StreamJsonTextBlock {
  type: "text";
  text: string;
}

export type StreamJsonContentBlock = StreamJsonToolUse | StreamJsonTextBlock;

export interface StreamJsonAssistantMessage {
  type: "assistant";
  message: {
    role: "assistant";
    content: StreamJsonContentBlock[];
  };
}

export interface StreamJsonToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

export interface StreamJsonUserMessage {
  type: "user";
  message: {
    role: "user";
    content: StreamJsonToolResult[];
  };
}

export interface StreamJsonResult {
  type: "result";
  subtype: "success" | "error";
  cost_usd: number;
  duration_ms: number;
  num_turns: number;
  result: string;
  session_id: string;
}

export type StreamJsonEvent =
  | StreamJsonSystemInit
  | StreamJsonAssistantMessage
  | StreamJsonUserMessage
  | StreamJsonResult;

// ─── Claude Event (IPC 스트리밍) ────────────────────────

export type ClaudeEventPhase =
  | "started"
  | "stream-event"
  | "stderr"
  | "completed"
  | "failed"
  | "cancelled";

export interface ClaudeEventBase {
  requestId: string;
  phase: ClaudeEventPhase;
  timestamp: number;
}

// started: 프로세스 spawn 성공
// stream-event: 파싱된 stream-json 이벤트
// stderr: 에러 진단용 raw 청크
// completed: 정상 종료(exit 0) · failed: 비정상 종료 또는 에러 · cancelled: 사용자 취소
export type ClaudeEvent =
  | (ClaudeEventBase & { phase: "started"; pid: number })
  | (ClaudeEventBase & { phase: "stream-event"; event: StreamJsonEvent })
  | (ClaudeEventBase & { phase: "stderr"; chunk: string })
  | (ClaudeEventBase & { phase: "completed"; exitCode: number; signal: NodeJS.Signals | null; costUsd?: number; durationMs?: number })
  | (ClaudeEventBase & { phase: "failed"; error: string })
  | (ClaudeEventBase & { phase: "cancelled" });

// ─── Git Diff ───────────────────────────────────────────

export interface GitDiffRequest {
  cwd: string;
  /** 특정 파일만 diff할 경우 경로 목록 전달 */
  paths?: string[];
}

export interface GitDiffLine {
  type: "addition" | "deletion" | "context";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface GitDiffHunk {
  header: string;
  lines: GitDiffLine[];
}

export interface GitDiffFileEntry {
  filePath: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  hunks: GitDiffHunk[];
}

export interface GitDiffResponse {
  files: GitDiffFileEntry[];
  totalAdditions: number;
  totalDeletions: number;
  error?: string;
}

// ─── Desktop API (preload → renderer) ───────────────────

export interface AtlasDesktopApi {
  runClaude(request: ClaudeRunRequest): Promise<ClaudeRunResponse>;
  cancelClaude(request: ClaudeCancelRequest): Promise<ClaudeCancelResponse>;
  getClaudeAuthStatus(request?: ClaudeAuthStatusRequest): Promise<ClaudeAuthStatusResponse>;
  getGitDiff(request: GitDiffRequest): Promise<GitDiffResponse>;
  onClaudeEvent(listener: (event: ClaudeEvent) => void): () => void;
}
