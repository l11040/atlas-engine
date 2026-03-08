// 책임: Jira 티켓 트리를 SQLite에 저장하고 조회한다.

import type { JiraTicketTree } from "../../../shared/ipc";
import { decodeStoredValue, encodeStoredValue } from "../storage/codec";
import { getAppDatabase } from "../storage/sqlite-db";

export function saveTicketTree(tree: JiraTicketTree): void {
  const db = getAppDatabase();
  db.prepare(`
    INSERT INTO jira_ticket_tree (id, data, updated_at)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `).run(encodeStoredValue(tree), Date.now());
}

export function loadTicketTree(): JiraTicketTree | null {
  const db = getAppDatabase();
  const row = db.prepare("SELECT data FROM jira_ticket_tree WHERE id = 1").get() as { data: unknown } | undefined;
  if (!row) return null;
  return decodeStoredValue<JiraTicketTree>(row.data);
}
