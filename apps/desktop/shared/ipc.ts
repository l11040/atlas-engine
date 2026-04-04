// 렌더러 → 메인: CLI, 설정, 로그, 파이프라인
export const IPC_CHANNELS = {
  cliRun: "cli:run",
  cliCancel: "cli:cancel",
  cliEvent: "cli:event",
  cliAuthStatus: "cli:auth-status",
  gitDiff: "git:diff",
  configGet: "config:get",
  configUpdate: "config:update",
  // 렌더러 → 메인: 로그 감시 제어
  logWatcherStart: "log-watcher:start",
  logWatcherStop: "log-watcher:stop",
  // 렌더러 → 메인: 로그 조회
  logQuery: "log:query",
  // 메인 → 렌더러: 새 로그 push
  logNewEntries: "log:new-entries",
  // 렌더러 → 메인: 파이프라인 정의 CRUD
  pipelineGet: "pipeline:get",
  pipelineSave: "pipeline:save",
  pipelineImport: "pipeline:import",
  pipelineList: "pipeline:list"
} as const;

// ─── Provider ──────────────────────────────────────

export type ProviderType = "claude" | "codex";

// ─── CLI Conversation ───────────────────────────────────

// 목적: 세션 이어쓰기/재개/신규 시작 정책을 정의한다.
export type CliConversationMode = "new" | "continue-last" | "resume-id";

export interface CliConversationOptions {
  mode?: CliConversationMode;
  sessionId?: string;
  forkOnResume?: boolean;
  ephemeral?: boolean;
}

// ─── CLI Run (정규화) ───────────────────────────────────

export interface CliRunRequest {
  requestId: string;
  provider: ProviderType;
  prompt: string;
  cwd?: string;
  conversation?: CliConversationOptions;
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

export interface ToolTimelineEntry {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  result?: string;
  timestamp: number;
  completedAt?: number;
}

export interface TerminalLog {
  status: "completed" | "failed";
  output: string;
  stderr: string;
  error?: string;
  toolTimeline: ToolTimelineEntry[];
}

// 목적: provider에 관계없이 렌더러가 소비하는 정규화된 이벤트 union
export type CliEvent =
  | { requestId: string; provider: ProviderType; phase: "started"; pid: number; timestamp: number }
  | { requestId: string; provider: ProviderType; phase: "text"; text: string; timestamp: number }
  | { requestId: string; provider: ProviderType; phase: "tool-use"; tool: CliToolUse; timestamp: number }
  | { requestId: string; provider: ProviderType; phase: "tool-result"; toolResult: CliToolResult; timestamp: number }
  | { requestId: string; provider: ProviderType; phase: "result"; result: CliSessionResult; timestamp: number }
  | { requestId: string; provider: ProviderType; phase: "parse-error"; rawLine: string; error: string; timestamp: number }
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

// ─── Log Query ──────────────────────────────────────────
// 렌더러 → 메인: 훅 로그 조회 요청

export interface LogQueryRequest {
  sessionId?: string;
  type?: "agent" | "skill";
  name?: string;
  since?: string;
  limit?: number;
}

export type NodeStatus = "pending" | "running" | "completed" | "failed";

export interface HookLogEntry {
  id: number;
  type: "agent" | "skill";
  sessionId: string;
  name: string;
  instanceKey?: string;
  startTime: string;
  // 목적: 에이전트 실행 중(stop 훅 전)에는 null이므로 optional로 처리한다.
  endTime?: string;
  durationSec?: number;
  caller?: { agentId: string; agentType: string } | "orchestrator";
  args?: string;
  childAgentId?: string;
  childStatus?: string;
  detail?: string;
}

export interface SessionSummary {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  agentCount: number;
  skillCount: number;
  args?: string;
}

// ─── Pipeline Definition ────────────────────────────────
// 렌더러 → 메인: 파이프라인 정의 CRUD

export interface PipelineDefinition {
  id: string;
  name: string;
  nodes: PipelineNodeDef[];
  edges: PipelineEdgeDef[];
}

export interface PipelineNodeDef {
  id: string;
  type: "agent" | "skill";
  label: string;
  description?: string;
  parentId?: string;
}

export interface PipelineEdgeDef {
  source: string;
  target: string;
  label?: string;
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
  // 로그
  startLogWatcher(cwd: string): Promise<void>;
  stopLogWatcher(): Promise<void>;
  queryLogs(request: LogQueryRequest): Promise<HookLogEntry[]>;
  querySessions(): Promise<SessionSummary[]>;
  onLogNewEntries(listener: (entries: HookLogEntry[]) => void): () => void;
  // 파이프라인
  getPipeline(id: string): Promise<PipelineDefinition | null>;
  savePipeline(definition: PipelineDefinition): Promise<void>;
  importPipeline(): Promise<PipelineDefinition | null>;
  listPipelines(): Promise<Array<{ id: string; name: string }>>;
}
