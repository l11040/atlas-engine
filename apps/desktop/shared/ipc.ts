// 렌더러 → 메인: 설정, 로그, 파이프라인
export const IPC_CHANNELS = {
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

// ─── App Settings ───────────────────────────────────────

export interface AppSettings {
  defaultCwd: string;
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
  caller?: { agentId: string; agentType: string };
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
  getConfig(): Promise<AppSettings>;
  updateConfig(request: AppSettingsUpdateRequest): Promise<AppSettings>;
  // 로그
  startLogWatcher(): Promise<void>;
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
