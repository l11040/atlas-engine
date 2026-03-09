// 책임: RunState의 메모리 캐시 + SQLite 영속화를 관리한다.

import type { RunState } from "../../../shared/ipc";
import { getAppDatabase } from "../storage/sqlite-db";
import { encodeStoredValue, decodeStoredValue } from "../storage/codec";

let cached: RunState | null = null;

function normalizeRunState(state: RunState): RunState {
  return {
    ...state,
    logs: Array.isArray(state.logs) ? state.logs : [],
    toolTimeline: Array.isArray(state.toolTimeline) ? state.toolTimeline : []
  };
}

export function getRunState(): RunState | null {
  if (cached) return cached;

  const db = getAppDatabase();
  const row = db.prepare("SELECT data FROM runs ORDER BY updated_at DESC LIMIT 1").get() as
    | { data: unknown }
    | undefined;

  if (!row) return null;
  const decoded = decodeStoredValue<RunState>(row.data);
  cached = decoded ? normalizeRunState(decoded) : null;
  return cached;
}

export function saveRunState(state: RunState): void {
  cached = normalizeRunState(state);
  const db = getAppDatabase();
  const now = Date.now();
  const blob = encodeStoredValue(cached);

  db.prepare(
    `INSERT INTO runs (run_id, ticket_id, data, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(run_id) DO UPDATE SET data = ?, status = ?, updated_at = ?`
  ).run(
    cached.runId,
    cached.ticketId,
    blob,
    cached.status,
    cached.startedAt ?? now,
    now,
    blob,
    state.status,
    now
  );
}

export function clearRunState(): void {
  cached = null;
}
