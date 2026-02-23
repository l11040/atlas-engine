// 렌더러 → 메인: CLI 실행 요청/취소, 인증 상태 조회, git diff 조회, 앱 설정 관리
export const IPC_CHANNELS = {
  cliRun: "cli:run",
  cliCancel: "cli:cancel",
  cliEvent: "cli:event",
  cliAuthStatus: "cli:auth-status",
  gitDiff: "git:diff",
  configGet: "config:get",
  configUpdate: "config:update"
} as const;

// ─── Provider ──────────────────────────────────────

export type ProviderType = "claude" | "codex";

// ─── CLI Run (정규화) ───────────────────────────────────

export interface CliRunRequest {
  requestId: string;
  provider: ProviderType;
  prompt: string;
  cwd?: string;
}

export interface CliRunResponse {
  status: "accepted" | "rejected";
  requestId: string;
  message?: string;
}

export interface CliCancelRequest {
  requestId: string;
}

export interface CliCancelResponse {
  status: "cancelled" | "not_found";
  requestId: string;
}

// ─── CLI Auth (정규화) ──────────────────────────────────

export type CliAuthStatus = "authenticated" | "unauthenticated" | "cli_missing" | "error";

export interface CliAuthCheckRequest {
  provider: ProviderType;
  cwd?: string;
  timeoutMs?: number;
}

export interface CliAuthStatusResponse {
  provider: ProviderType;
  status: CliAuthStatus;
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

// ─── CLI Event (정규화된 스트리밍) ──────────────────────

export interface CliToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface CliToolResult {
  toolUseId: string;
  content: string;
}

export interface CliSessionResult {
  costUsd?: number;
  durationMs?: number;
  numTurns?: number;
}

// 목적: provider에 관계없이 렌더러가 소비하는 정규화된 이벤트 union
export type CliEvent =
  | { requestId: string; provider: ProviderType; phase: "started"; pid: number; timestamp: number }
  | { requestId: string; provider: ProviderType; phase: "text"; text: string; timestamp: number }
  | { requestId: string; provider: ProviderType; phase: "tool-use"; tool: CliToolUse; timestamp: number }
  | { requestId: string; provider: ProviderType; phase: "tool-result"; toolResult: CliToolResult; timestamp: number }
  | { requestId: string; provider: ProviderType; phase: "result"; result: CliSessionResult; timestamp: number }
  | { requestId: string; provider: ProviderType; phase: "stderr"; chunk: string; timestamp: number }
  | { requestId: string; provider: ProviderType; phase: "completed"; exitCode: number; signal: NodeJS.Signals | null; timestamp: number }
  | { requestId: string; provider: ProviderType; phase: "failed"; error: string; timestamp: number }
  | { requestId: string; provider: ProviderType; phase: "cancelled"; timestamp: number };

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

// ─── App Settings ───────────────────────────────────────

// 목적: provider 간 공통 권한 모드를 정의한다.
// auto: 모든 도구 권한을 자동 승인 (Claude: bypassPermissions, Codex: never)
// manual: 사용자 확인 후 실행 (Claude: default, Codex: on-request)
export type CliPermissionMode = "auto" | "manual";

export interface CliSettings {
  timeoutMs: number;
  permissionMode: CliPermissionMode;
}

export interface AppSettings {
  defaultCwd: string;
  activeProvider: ProviderType;
  cli: CliSettings;
}

// 목적: 부분 업데이트를 지원하기 위한 재귀적 Partial 타입
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export interface AppSettingsUpdateRequest {
  settings: DeepPartial<AppSettings>;
}

// ─── Desktop API (preload → renderer) ───────────────────

export interface AtlasDesktopApi {
  runCli(request: CliRunRequest): Promise<CliRunResponse>;
  cancelCli(request: CliCancelRequest): Promise<CliCancelResponse>;
  getCliAuthStatus(request: CliAuthCheckRequest): Promise<CliAuthStatusResponse>;
  getGitDiff(request: GitDiffRequest): Promise<GitDiffResponse>;
  onCliEvent(listener: (event: CliEvent) => void): () => void;
  getConfig(): Promise<AppSettings>;
  updateConfig(request: AppSettingsUpdateRequest): Promise<AppSettings>;
}
