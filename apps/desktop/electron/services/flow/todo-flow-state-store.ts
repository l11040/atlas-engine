// 책임: Todo별 실행 상태의 메모리 캐시와 SQLite 영속화를 관리한다.
// 이유: 앱 재시작 후 상태 복원과 단계별 진행 상태 추적을 안정적으로 유지한다.

import type {
  ActivityLogEntry,
  TodoFlowBackendState,
  TodoFlowPhase,
  TodoFlowStatus,
  TodoFlowStepState
} from "../../../shared/ipc";
import { decodeStoredValue, encodeStoredValue } from "../storage/codec";
import { getAppDatabase } from "../storage/sqlite-db";

const FLOW_PHASES: TodoFlowPhase[] = ["workorder", "explore", "execute", "verify", "dod"];

function createInitialSteps(): TodoFlowStepState[] {
  return FLOW_PHASES.map((phase) => ({
    phase,
    status: "idle" as TodoFlowStatus,
    startedAt: null,
    endedAt: null,
    result: null,
    error: null
  }));
}

function normalizeSteps(raw: unknown): TodoFlowStepState[] {
  if (!Array.isArray(raw)) {
    return createInitialSteps();
  }

  const byPhase = new Map<TodoFlowPhase, TodoFlowStepState>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const step = item as Partial<TodoFlowStepState>;
    if (!step.phase || !FLOW_PHASES.includes(step.phase)) continue;
    byPhase.set(step.phase, {
      phase: step.phase,
      status: step.status ?? "idle",
      startedAt: step.startedAt ?? null,
      endedAt: step.endedAt ?? null,
      result: step.result ?? null,
      error: step.error ?? null
    });
  }

  return FLOW_PHASES.map((phase) => byPhase.get(phase) ?? {
    phase,
    status: "idle",
    startedAt: null,
    endedAt: null,
    result: null,
    error: null
  });
}

function normalizeState(raw: Partial<TodoFlowBackendState>, fallbackTodoId: string): TodoFlowBackendState {
  return {
    todoId: raw.todoId ?? fallbackTodoId,
    status: raw.status ?? "idle",
    currentPhase: raw.currentPhase ?? null,
    steps: normalizeSteps(raw.steps),
    workOrder: raw.workOrder ?? null,
    evidence: raw.evidence ?? null,
    finalVerdict: raw.finalVerdict ?? null,
    error: raw.error ?? null,
    startedAt: raw.startedAt ?? null,
    endedAt: raw.endedAt ?? null
  };
}

// ─── TodoFlowStateStore ─────────────────────────────────

export class TodoFlowStateStore {
  private states = new Map<string, TodoFlowBackendState>();

  // 목적: 특정 Todo의 상태 스냅샷을 반환한다.
  getState(todoId: string): TodoFlowBackendState | null {
    return this.states.get(todoId) ?? null;
  }

  // 목적: 모든 Todo 상태를 Record로 반환한다.
  getAllStates(): Record<string, TodoFlowBackendState> {
    const result: Record<string, TodoFlowBackendState> = {};
    for (const [id, state] of this.states) {
      result[id] = state;
    }
    return result;
  }

  // 목적: 메모리에 상태를 설정한다.
  setState(todoId: string, state: TodoFlowBackendState): void {
    this.states.set(todoId, normalizeState(state, todoId));
  }

  // 목적: 상태의 메타 정보를 SQLite에 저장한다.
  async saveMeta(todoId: string): Promise<void> {
    this.persistTodoState(todoId);
  }

  // 목적: steps 배열을 SQLite에 저장한다.
  async saveSteps(todoId: string): Promise<void> {
    this.persistTodoState(todoId);
  }

  // 목적: phase 산출물 저장 시 전체 상태를 함께 갱신한다.
  async saveNodeArtifact(todoId: string, _phase: TodoFlowPhase, _data: unknown): Promise<void> {
    this.persistTodoState(todoId);
  }

  // 목적: 활동 로그를 SQLite에 append 저장한다.
  async appendActivity(todoId: string, entries: ActivityLogEntry[]): Promise<void> {
    if (entries.length === 0) return;

    const db = getAppDatabase();
    const insert = db.prepare(`
      INSERT INTO todo_flow_activity (todo_id, entry, created_at)
      VALUES (?, ?, ?)
    `);

    const now = Date.now();
    for (const entry of entries) {
      insert.run(todoId, encodeStoredValue(entry), now);
    }
  }

  // 목적: 기존 호출부 호환을 위해 메서드를 유지한다.
  async saveActivePointer(): Promise<void> {
    // no-op: SQLite에서는 active pointer를 별도 파일로 관리하지 않는다.
  }

  // 목적: 앱 시작 시 SQLite에서 상태를 복원한다.
  async loadFromDisk(): Promise<void> {
    this.states = this.loadStatesFromDatabase();
  }

  // 목적: running 상태인 Todo를 interrupted로 마킹한다.
  async markAllRunningAsInterrupted(): Promise<void> {
    for (const [todoId, state] of this.states) {
      if (state.status !== "running") continue;

      state.status = "error";
      state.error = "앱 재시작으로 중단됨";
      state.endedAt = Date.now();

      for (const step of state.steps) {
        if (step.status !== "running") continue;
        step.status = "error";
        step.error = "앱 재시작으로 중단됨";
        step.endedAt = Date.now();
      }

      this.states.set(todoId, state);
      this.persistTodoState(todoId);
    }
  }

  // ─── SQLite ───────────────────────────────────────────

  private persistTodoState(todoId: string): void {
    const state = this.states.get(todoId);
    if (!state) return;

    const db = getAppDatabase();
    db.prepare(`
      INSERT INTO todo_flow_states (todo_id, data, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(todo_id) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at
    `).run(todoId, encodeStoredValue(state), Date.now());
  }

  private loadStatesFromDatabase(): Map<string, TodoFlowBackendState> {
    const db = getAppDatabase();
    const rows = db.prepare("SELECT todo_id, data FROM todo_flow_states").all() as Array<{ todo_id: string; data: unknown }>;
    const states = new Map<string, TodoFlowBackendState>();

    for (const row of rows) {
      const decoded = decodeStoredValue<Partial<TodoFlowBackendState>>(row.data);
      if (!decoded) continue;
      states.set(row.todo_id, normalizeState(decoded, row.todo_id));
    }

    return states;
  }
}
