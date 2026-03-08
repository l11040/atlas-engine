// 책임: RunState의 메모리 캐시 + SQLite 영속화를 관리한다.

import type { RunState } from "../../../shared/ipc";
import { getAppDatabase } from "../storage/sqlite-db";
import { encodeStoredValue, decodeStoredValue } from "../storage/codec";

let cached: RunState | null = null;

export function getRunState(): RunState | null {
  if (cached) return cached;

  const db = getAppDatabase();
  const row = db.prepare("SELECT data FROM runs ORDER BY updated_at DESC LIMIT 1").get() as
    | { data: unknown }
    | undefined;

  if (!row) return null;
  cached = decodeStoredValue<RunState>(row.data);
  return cached;
}

export function saveRunState(state: RunState): void {
  cached = state;
  const db = getAppDatabase();
  const now = Date.now();
  const blob = encodeStoredValue(state);

  db.prepare(
    `INSERT INTO runs (run_id, ticket_id, data, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(run_id) DO UPDATE SET data = ?, status = ?, updated_at = ?`
  ).run(
    state.runId,
    state.ticketId,
    blob,
    state.status,
    state.startedAt ?? now,
    now,
    blob,
    state.status,
    now
  );
}

export function clearRunState(): void {
  cached = null;
}
