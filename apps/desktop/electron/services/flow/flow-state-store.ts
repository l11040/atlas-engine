// 책임: FlowState의 메모리 캐시와 SQLite 영속화를 관리한다.

import type { FlowState } from "../../../shared/ipc";
import { decodeStoredValue, encodeStoredValue } from "../storage/codec";
import { getAppDatabase } from "../storage/sqlite-db";

// ─── 초기 상태 ──────────────────────────────────────────

// 주의: optional 필드도 명시적으로 포함해야 spread 병합 시 이전 값이 초기화된다.
export const INITIAL_FLOW_STATE: FlowState = {
  flowId: null,
  flowType: null,
  status: "idle",
  startedAt: null,
  endedAt: null,
  error: null,
  nodeProgress: [],
  currentPhase: "idle",
  holdAtPhase: undefined,
  dorFormalResult: undefined,
  dorFormalReason: undefined,
  dorSemanticResult: undefined,
  dorSemanticReason: undefined,
  todos: [],
  holdReason: "",
  activityLog: []
};

function createInitialFlowState(): FlowState {
  return {
    ...INITIAL_FLOW_STATE,
    nodeProgress: [],
    todos: [],
    activityLog: []
  };
}

function normalizeFlowState(raw: Partial<FlowState>): FlowState {
  return {
    flowId: raw.flowId ?? null,
    flowType: raw.flowType ?? null,
    status: raw.status ?? "idle",
    startedAt: raw.startedAt ?? null,
    endedAt: raw.endedAt ?? null,
    error: raw.error ?? null,
    nodeProgress: Array.isArray(raw.nodeProgress) ? raw.nodeProgress : [],
    currentPhase: raw.currentPhase ?? "idle",
    holdAtPhase: raw.holdAtPhase ?? undefined,
    holdReason: raw.holdReason ?? "",
    dorFormalResult: raw.dorFormalResult ?? undefined,
    dorFormalReason: raw.dorFormalReason ?? undefined,
    dorSemanticResult: raw.dorSemanticResult ?? undefined,
    dorSemanticReason: raw.dorSemanticReason ?? undefined,
    todos: Array.isArray(raw.todos) ? raw.todos : [],
    activityLog: Array.isArray(raw.activityLog) ? raw.activityLog : []
  };
}

// ─── FlowStateStore ─────────────────────────────────────

export class FlowStateStore {
  private state: FlowState = createInitialFlowState();

  // 목적: 현재 상태의 스냅샷을 반환한다.
  getSnapshot(): FlowState {
    return this.state;
  }

  // 목적: 상태를 부분 갱신하고 SQLite에 저장한다.
  async update(partial: Partial<FlowState>): Promise<void> {
    this.state = normalizeFlowState({
      ...this.state,
      ...partial
    });

    this.persistState();
  }

  // 목적: 앱 시작 시 SQLite에서 상태를 복원한다.
  async loadFromDisk(): Promise<void> {
    const fromDb = this.readStateFromDatabase();
    if (fromDb) {
      this.state = fromDb;
      return;
    }

    this.state = createInitialFlowState();
  }

  // 목적: 상태를 초기값으로 리셋한다.
  async reset(): Promise<void> {
    this.state = createInitialFlowState();
    this.persistState();
  }

  // ─── SQLite ───────────────────────────────────────────

  private persistState(): void {
    const db = getAppDatabase();
    db.prepare(`
      INSERT INTO flow_state (id, data, updated_at)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at
    `).run(encodeStoredValue(this.state), Date.now());
  }

  private readStateFromDatabase(): FlowState | null {
    const db = getAppDatabase();
    const row = db.prepare("SELECT data FROM flow_state WHERE id = 1").get() as { data: unknown } | undefined;
    if (!row) return null;

    const decoded = decodeStoredValue<Partial<FlowState>>(row.data);
    if (!decoded) return null;
    return normalizeFlowState(decoded);
  }
}
