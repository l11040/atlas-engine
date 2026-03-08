// 책임: TaskExecutionState의 메모리 캐시 + SQLite 영속화를 관리한다.

import type { TaskExecutionState } from "../../../shared/ipc";
import { getAppDatabase } from "../storage/sqlite-db";
import { encodeStoredValue, decodeStoredValue } from "../storage/codec";

const cache = new Map<string, TaskExecutionState>();

export function getTaskState(taskId: string): TaskExecutionState | null {
  if (cache.has(taskId)) return cache.get(taskId)!;

  const db = getAppDatabase();
  const row = db.prepare("SELECT data FROM task_executions WHERE task_id = ?").get(taskId) as
    | { data: unknown }
    | undefined;

  if (!row) return null;
  const state = decodeStoredValue<TaskExecutionState>(row.data);
  if (state) cache.set(taskId, state);
  return state;
}

export function getAllTaskStates(runId: string): Record<string, TaskExecutionState> {
  const db = getAppDatabase();
  const rows = db.prepare("SELECT task_id, data FROM task_executions WHERE run_id = ?").all(runId) as Array<{
    task_id: string;
    data: unknown;
  }>;

  const result: Record<string, TaskExecutionState> = {};
  for (const row of rows) {
    const state = decodeStoredValue<TaskExecutionState>(row.data);
    if (state) {
      result[row.task_id] = state;
      cache.set(row.task_id, state);
    }
  }
  return result;
}

export function saveTaskState(runId: string, state: TaskExecutionState): void {
  cache.set(state.taskId, state);
  const db = getAppDatabase();
  const now = Date.now();
  const blob = encodeStoredValue(state);

  db.prepare(
    `INSERT INTO task_executions (task_id, run_id, data, status, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(task_id) DO UPDATE SET data = ?, status = ?, updated_at = ?`
  ).run(state.taskId, runId, blob, state.status, now, blob, state.status, now);
}

export function clearTaskStates(): void {
  cache.clear();
}
