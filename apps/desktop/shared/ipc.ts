// 렌더러 → 메인: CLI, 설정, Jira, 자동화 파이프라인
export const IPC_CHANNELS = {
  cliRun: "cli:run",
  cliCancel: "cli:cancel",
  cliEvent: "cli:event",
  cliAuthStatus: "cli:auth-status",
  gitDiff: "git:diff",
  configGet: "config:get",
  configUpdate: "config:update",
  jiraTestConnection: "jira:test-connection",
  jiraFetchTicketTree: "jira:fetch-ticket-tree",
  jiraGetTicketTree: "jira:get-ticket-tree",
  jiraGetAllTicketTrees: "jira:get-all-ticket-trees",
  jiraProgress: "jira:progress",
  // 렌더러 → 메인: 자동화 파이프라인 실행 제어
  runStart: "run:start",
  runCancel: "run:cancel",
  runGetState: "run:get-state",
  runReset: "run:reset",
  // 렌더러 → 메인: 작업 단위 제어 및 승인 게이트
  taskGetState: "task:get-state",
  taskGetAllStates: "task:get-all-states",
  taskCancel: "task:cancel",
  taskApprove: "task:approve",
  taskReject: "task:reject",
  taskRegenerate: "task:regenerate"
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
// auto: 모든 도구 권한을 자동 승인 (Claude: bypassPermissions, Codex: --full-auto)
// manual: 사용자 확인 후 실행 (Claude: default, Codex: 기본 동작)
export type CliPermissionMode = "auto" | "manual";

export interface CliSettings {
  timeoutMs: number;
  permissionMode: CliPermissionMode;
}

// 목적: LangSmith 추적 설정을 정의한다.
export interface TracingSettings {
  enabled: boolean;
  apiKey: string;
  project: string;
  endpoint: string;
}

// 목적: Jira REST API 연결 설정을 정의한다.
export interface JiraSettings {
  baseUrl: string;
  email: string;
  apiToken: string;
  /** 목적: 프로젝트 키 프리픽스. 설정하면 숫자만 입력해도 자동으로 붙인다. (예: "GRID") */
  projectPrefix: string;
}

export interface AppSettings {
  defaultCwd: string;
  activeProvider: ProviderType;
  cli: CliSettings;
  tracing?: TracingSettings;
  jira?: JiraSettings;
}

// 목적: 부분 업데이트를 지원하기 위한 재귀적 Partial 타입
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export interface AppSettingsUpdateRequest {
  settings: DeepPartial<AppSettings>;
}

// ─── Automation Pipeline: 상태 모델 ─────────────────────────
// 목적: 요구사항 기반 자동화 파이프라인의 전체 상태를 정의한다.

export type RunStatus = "idle" | "running" | "paused" | "completed" | "failed";

export type RunStep =
  | "idle"
  | "ingestion"
  | "analyze"
  | "risk"
  | "plan"
  | "execution"
  | "archiving"
  | "done";

export interface RunState {
  runId: string;
  ticketId: string;
  status: RunStatus;
  currentStep: RunStep;
  startedAt: number | null;
  endedAt: number | null;
  error: string | null;
  parsedRequirements: ParsedRequirements | null;
  riskAssessment: RiskAssessment | null;
  executionPlan: ExecutionPlan | null;
}

// ─── 요구사항 ─────────────────────────────────────────

export interface AcceptanceCriterion {
  id: string;
  description: string;
  testable: boolean;
}

export interface TestScenario {
  id: string;
  description: string;
  linked_ac_ids: string[];
}

export interface ParsedRequirements {
  acceptance_criteria: AcceptanceCriterion[];
  policy_rules: string[];
  implementation_steps: string[];
  test_scenarios: TestScenario[];
  missing_sections: string[];
  description_raw: string;
}

// ─── 위험 평가 ────────────────────────────────────────

export interface RiskFactor {
  category: string;
  description: string;
  severity: "low" | "medium" | "high";
}

export interface RiskAssessment {
  level: "low" | "medium" | "high";
  factors: RiskFactor[];
  recommendation: string;
}

// ─── 실행 계획 ────────────────────────────────────────

export interface TaskUnit {
  id: string;
  title: string;
  description: string;
  linked_ac_ids: string[];
  deps: string[];
  scope: {
    editable_paths: string[];
    forbidden_paths: string[];
  };
  verify_cmd: string | null;
}

export interface ExecutionPlan {
  tasks: TaskUnit[];
  execution_order: string[];
}

// ─── 작업 실행 상태 (Task 단위) ──────────────────────

export type TaskStatus =
  | "idle"
  | "running"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "completed"
  | "failed";

export type TaskStep =
  | "idle"
  | "generate_changes"
  | "explain_changes"
  | "self_verify"
  | "revise"
  | "approval_gate"
  | "apply_changes"
  | "post_verify"
  | "done";

export interface TaskExecutionState {
  taskId: string;
  status: TaskStatus;
  currentStep: TaskStep;
  attempt: { current: number; max: number };
  changeSets: ChangeSet | null;
  explanation: ChangeExplanation | null;
  verification: VerificationResult | null;
  approval: ApprovalRecord | null;
  error: string | null;
  startedAt: number | null;
  endedAt: number | null;
}

// ─── 변경 ─────────────────────────────────────────────

export interface ChangeSet {
  changes: Array<{
    path: string;
    action: "create" | "modify" | "delete";
    diff_summary: string;
  }>;
  diff: string | null;
  scope_violations: string[];
}

export interface ChangeExplanation {
  summary: string;
  change_reasons: Array<{
    path: string;
    reason: string;
    linked_ac_ids: string[];
  }>;
  risk_notes: string[];
}

// ─── 검증 ─────────────────────────────────────────────

export interface VerificationCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface VerificationResult {
  verdict: "pass" | "fail";
  checks: VerificationCheck[];
  failure_reasons: string[];
}

// ─── 승인 ─────────────────────────────────────────────

export interface ApprovalRecord {
  decision: "approved" | "rejected" | "regenerate";
  reason: string | null;
  decidedAt: number;
  decidedBy: "auto" | "human";
}

// ─── Automation IPC ─────────────────────────────────────

export interface RunStartRequest {
  ticketId: string;
}

export interface RunStartResponse {
  status: "accepted" | "rejected";
  runId: string;
  message?: string;
}

export interface RunCancelRequest {
  runId: string;
}

export interface TaskApprovalRequest {
  taskId: string;
  decision: "approved" | "rejected" | "regenerate";
  reason?: string;
}

// ─── Jira Ticket (API 응답 정규화) ──────────────────────────
// 목적: Jira REST API에서 가져온 이슈를 정규화한 타입을 정의한다.
// 계층: Epic → Story → Subtask, links로 관계 표현

export interface JiraTicketLink {
  type: "Blocks" | "Relates" | string;
  direction: "inward" | "outward";
  key: string;
}

export interface JiraTicket {
  key: string;
  summary: string;
  status: string;
  issuetype: string;
  priority: string;
  assignee: string | null;
  reporter: string | null;
  created: string;
  updated: string;
  parent: string | null;
  subtasks: string[];
  links: JiraTicketLink[];
  labels: string[];
  description: string | null;
}

export interface JiraTicketTree {
  root: string;
  exportedAt: string;
  total: number;
  tickets: Record<string, JiraTicket>;
}

// ─── Jira IPC ─────────────────────────────────────────────
// 렌더러 → 메인: Jira 연결 테스트 및 티켓 트리 조회

export interface JiraTestConnectionRequest {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export interface JiraTestConnectionResponse {
  success: boolean;
  message: string;
  displayName?: string;
}

export interface JiraFetchTicketTreeRequest {
  ticketKey: string;
}

export interface JiraFetchTicketTreeResponse {
  success: boolean;
  message: string;
  tree?: JiraTicketTree;
}

// ─── Jira Progress Event ─────────────────────────────────
// 메인 → 렌더러: 티켓 트리 수집 진행 상태 push
export type JiraProgressEvent =
  | { phase: "fetching"; key: string; collected: number }
  | { phase: "searching-children"; key: string; collected: number }
  | { phase: "completed"; total: number }
  | { phase: "error"; message: string };

// ─── Desktop API (preload → renderer) ───────────────────

export interface AtlasDesktopApi {
  runCli(request: CliRunRequest): Promise<CliRunResponse>;
  cancelCli(request: CliCancelRequest): Promise<CliCancelResponse>;
  getCliAuthStatus(request: CliAuthCheckRequest): Promise<CliAuthStatusResponse>;
  getGitDiff(request: GitDiffRequest): Promise<GitDiffResponse>;
  onCliEvent(listener: (event: CliEvent) => void): () => void;
  // 자동화 파이프라인
  startRun(request: RunStartRequest): Promise<RunStartResponse>;
  cancelRun(request: RunCancelRequest): Promise<void>;
  getRunState(): Promise<RunState | null>;
  resetRun(): Promise<void>;
  getTaskState(taskId: string): Promise<TaskExecutionState | null>;
  getAllTaskStates(): Promise<Record<string, TaskExecutionState>>;
  cancelTask(taskId: string): Promise<void>;
  approveTask(request: TaskApprovalRequest): Promise<void>;
  getConfig(): Promise<AppSettings>;
  updateConfig(request: AppSettingsUpdateRequest): Promise<AppSettings>;
  testJiraConnection(request: JiraTestConnectionRequest): Promise<JiraTestConnectionResponse>;
  fetchJiraTicketTree(request: JiraFetchTicketTreeRequest): Promise<JiraFetchTicketTreeResponse>;
  getJiraTicketTree(rootKey: string): Promise<JiraTicketTree | null>;
  getAllJiraTicketTrees(): Promise<JiraTicketTree[]>;
  onJiraProgress(listener: (event: JiraProgressEvent) => void): () => void;
}
