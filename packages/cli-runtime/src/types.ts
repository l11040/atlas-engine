// 책임: CLI stdin/stdout 런타임에서 사용하는 공통 타입을 정의한다.

export type ProviderType = "claude" | "codex";

// 목적: provider 간 공통 권한 모드를 정의한다.
// auto: 모든 도구 권한 자동 승인 (Claude: bypassPermissions, Codex: full-auto)
// manual: 사용자 확인 기반 승인 (Claude: default, Codex: 기본 동작)
export type CliPermissionMode = "auto" | "manual";

// 목적: 세션 이어쓰기/분기/신규 시작 정책을 정의한다.
export type CliConversationMode = "new" | "continue-last" | "resume-id";

export interface CliConversationOptions {
  mode?: CliConversationMode;
  sessionId?: string;
  // 이유: 이어쓰기 세션을 그대로 덮지 않고 분기해서 사용할 때 활용한다.
  forkOnResume?: boolean;
  // 목적: 세션 파일을 디스크에 남기지 않는 일회성 실행 모드.
  ephemeral?: boolean;
}

export type CliPromptTransport = "auto" | "argv" | "stdin";

// ─── Claude stream-json raw event ───────────────────────

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

// ─── Normalized event ────────────────────────────────────

export interface CliToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface CliToolResult {
  toolUseId: string;
  content: string;
}

export interface CliSessionResultSummary {
  costUsd?: number;
  durationMs?: number;
  numTurns?: number;
}

export type CliEvent =
  | { requestId: string; provider: ProviderType; phase: "started"; pid: number; timestamp: number }
  | { requestId: string; provider: ProviderType; phase: "text"; text: string; timestamp: number }
  | { requestId: string; provider: ProviderType; phase: "tool-use"; tool: CliToolUse; timestamp: number }
  | { requestId: string; provider: ProviderType; phase: "tool-result"; toolResult: CliToolResult; timestamp: number }
  | { requestId: string; provider: ProviderType; phase: "result"; result: CliSessionResultSummary; timestamp: number }
  | { requestId: string; provider: ProviderType; phase: "parse-error"; rawLine: string; error: string; timestamp: number }
  | { requestId: string; provider: ProviderType; phase: "stderr"; chunk: string; timestamp: number }
  | { requestId: string; provider: ProviderType; phase: "completed"; exitCode: number; signal: NodeJS.Signals | null; timestamp: number }
  | { requestId: string; provider: ProviderType; phase: "failed"; error: string; timestamp: number }
  | { requestId: string; provider: ProviderType; phase: "cancelled"; timestamp: number };

// ─── Spawn/session ───────────────────────────────────────

export interface CliSpawnOptions {
  requestId: string;
  provider: ProviderType;
  prompt: string;
  cwd: string;
  permissionMode: CliPermissionMode;
  timeoutMs: number;
  allowTools?: boolean;
  conversation?: CliConversationOptions;
  promptTransport?: CliPromptTransport;
  // 목적: auto 모드에서 argv 전달 상한 길이(문자 수).
  maxArgPromptLength?: number;
  // 목적: SIGTERM 이후 강제 종료 전 대기 시간(ms).
  killGraceMs?: number;
  signal?: AbortSignal;
}

export interface StartCliSessionOptions extends CliSpawnOptions {
  onEvent?: (event: CliEvent) => void;
  onParseError?: (args: { provider: ProviderType; rawLine: string; error: Error }) => void;
}

export type CliSessionStatus = "completed" | "failed" | "cancelled" | "timeout";

export interface CliSessionResult {
  status: CliSessionStatus;
  events: CliEvent[];
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error?: string;
}

export interface CliSessionHandle {
  pid: number;
  cancel(): void;
  result: Promise<CliSessionResult>;
}

export interface CliExecutionErrorParams {
  events: CliEvent[];
  exitCode: number | null;
  stderr: string;
  status: CliSessionStatus;
}
