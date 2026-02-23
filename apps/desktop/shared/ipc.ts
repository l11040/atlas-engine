// 렌더러 → 메인: CLI 실행 요청/취소, 인증 상태 조회, git diff 조회, 앱 설정 관리
// 렌더러 → 메인: LangChain 플로우 실행/취소 및 이벤트 스트림
export const IPC_CHANNELS = {
  cliRun: "cli:run",
  cliCancel: "cli:cancel",
  cliEvent: "cli:event",
  cliAuthStatus: "cli:auth-status",
  flowInvoke: "flow:invoke",
  flowCancel: "flow:cancel",
  flowEvent: "flow:event",
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

// 목적: 파이프라인 실행 결과를 저장하여 페이지 재진입 시 복원한다.
export interface PipelineState {
  currentPhase: PipelinePhase;
  holdAtPhase?: PipelinePhase;
  dorFormalResult?: "pass" | "hold";
  dorFormalReason?: string;
  dorSemanticResult?: "proceed" | "hold";
  dorSemanticReason?: string;
  todos: TodoItem[];
  holdReason?: string;
  activityLog: ActivityLogEntry[];
}

export interface AppSettings {
  defaultCwd: string;
  activeProvider: ProviderType;
  cli: CliSettings;
  ticket?: Ticket;
  todos?: TodoItem[];
  pipeline?: PipelineState;
}

// 목적: 부분 업데이트를 지원하기 위한 재귀적 Partial 타입
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export interface AppSettingsUpdateRequest {
  settings: DeepPartial<AppSettings>;
}

// ─── LangChain Flow ─────────────────────────────────────

export type FlowType = "prompt" | "ticket-to-todo";

export interface FlowInvokeRequest {
  flowId: string;
  flowType: FlowType;
  provider: ProviderType;
  prompt: string;
  cwd?: string;
  /** 목적: 특정 그래프 노드부터 재실행할 때 노드 이름을 지정한다. */
  startFromNode?: string;
}

export interface FlowInvokeResponse {
  status: "accepted" | "rejected";
  flowId: string;
  message?: string;
}

export interface FlowCancelRequest {
  flowId: string;
}

export interface FlowMetadata {
  costUsd?: number;
  durationMs?: number;
  numTurns?: number;
}

// 목적: LangChain 플로우 실행 과정을 렌더러에서 시각화하기 위한 이벤트 union
// flow-start/flow-end: 전체 플로우 수명
// node-start/node-stream/node-end/node-error: 개별 노드(LLM 호출 등) 수명
export type FlowEvent =
  | { flowId: string; type: "flow-start"; timestamp: number }
  | { flowId: string; type: "node-start"; nodeId: string; nodeName: string; input: string; timestamp: number }
  | { flowId: string; type: "node-stream"; nodeId: string; chunk: string; timestamp: number }
  | { flowId: string; type: "node-end"; nodeId: string; output: string; metadata?: FlowMetadata; timestamp: number }
  | { flowId: string; type: "node-error"; nodeId: string; error: string; timestamp: number }
  | { flowId: string; type: "flow-end"; result: string; metadata?: FlowMetadata; timestamp: number }
  | { flowId: string; type: "flow-error"; error: string; timestamp: number };

// ─── Ticket (지라 이슈 정규화) ─────────────────────────────
// 목적: 지라 이슈를 정규화한 Ticket과 하위 구조(AC, 시나리오)를 정의한다.
// 계층: Ticket → Todo[] → WorkOrder[] (향후)

export type WorkOrderMode = "fast" | "standard" | "strict";

export interface TicketAC {
  id: string;
  description: string;
}

export interface TicketScenario {
  id: string;
  covers: string[];
  description: string;
}

export interface Ticket {
  jira_key: string;
  summary: string;
  acceptance_criteria: TicketAC[];
  test_scenarios: TicketScenario[];
  mode: WorkOrderMode;
  mode_locked: boolean;
}

// ─── TodoItem (원자 작업 단위) ─────────────────────────────
// 목적: Ticket에서 AC↔시나리오 매핑으로 생성된 원자 작업을 정의한다.
// attempt이 마스터 — WorkOrder 생성 시 여기서 복사

export type TodoStatus = "pending" | "in_progress" | "done" | "blocked";
export type TodoRisk = "low" | "med" | "high";
export type TodoRoute = "FE" | "BE";

export interface TodoItem {
  id: string;
  title: string;
  reason: string;
  deps: string[];
  risk: TodoRisk;
  route: TodoRoute;
  status: TodoStatus;
  attempt: { n: number; max: number };
  failure_history: FailureRecord[];
}

export interface FailureRecord {
  wo_id: string;
  attempt_n: number;
  verdict: "FAIL";
  taxonomy: string;
}

// ─── TodoList (전체 컨테이너) ──────────────────────────────

export interface TodoList {
  version: number;
  updated_at: string;
  jira_key: string;
  items: TodoItem[];
}

// ─── Pipeline Phase ────────────────────────────────────────
// 목적: 전체 파이프라인의 각 단계를 정의한다.
// 현재 Ticket→Todo 변환은 intake → dor → plan 까지 사용한다.

export type PipelinePhase =
  | "idle" | "intake" | "dor" | "plan" | "workorder" | "explore" | "execute" | "verify" | "dod" | "done" | "hold";

// ─── Activity / Run State ──────────────────────────────────

export type RunStatus = "idle" | "running" | "completed" | "hold" | "failed";

export interface ActivityLogEntry {
  timestamp: number;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

// ─── WorkOrder (향후 실행 단계용, 현재 미사용) ──────────────
// 목적: Atlas 7-Section + 운영 메타데이터. Todo 실행 시 Orchestrator가 생성한다.

export interface WorkOrderScope {
  editable_paths: string[];
  forbidden_paths: string[];
}

export interface WorkOrder {
  wo_id: string;
  task: string;
  expected_outcome: string;
  must_do: string[];
  must_not: string[];
  scope: WorkOrderScope;
  verify_cmd: string;
  evidence_required: string[];
  mode: WorkOrderMode;
  attempt: { n: number; max: number };
  frozen: boolean;
  origin_todo_id: string;
  retry_of_wo_id: string | null;
}

// ─── Desktop API (preload → renderer) ───────────────────

export interface AtlasDesktopApi {
  runCli(request: CliRunRequest): Promise<CliRunResponse>;
  cancelCli(request: CliCancelRequest): Promise<CliCancelResponse>;
  getCliAuthStatus(request: CliAuthCheckRequest): Promise<CliAuthStatusResponse>;
  getGitDiff(request: GitDiffRequest): Promise<GitDiffResponse>;
  onCliEvent(listener: (event: CliEvent) => void): () => void;
  invokeFlow(request: FlowInvokeRequest): Promise<FlowInvokeResponse>;
  cancelFlow(request: FlowCancelRequest): Promise<void>;
  onFlowEvent(listener: (event: FlowEvent) => void): () => void;
  getConfig(): Promise<AppSettings>;
  updateConfig(request: AppSettingsUpdateRequest): Promise<AppSettings>;
}
