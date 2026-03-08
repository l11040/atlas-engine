// 책임: Jira 티켓 트리를 SQLite에 저장하고 조회한다. root key 기준 다중 저장.

import type { JiraTicketTree } from "../../../shared/ipc";
import { decodeStoredValue, encodeStoredValue } from "../storage/codec";
import { getAppDatabase } from "../storage/sqlite-db";

export function saveTicketTree(tree: JiraTicketTree): void {
  const db = getAppDatabase();
  db.prepare(`
    INSERT INTO jira_ticket_tree (root_key, data, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(root_key) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `).run(tree.root, encodeStoredValue(tree), Date.now());
}

export function loadTicketTree(rootKey: string): JiraTicketTree | null {
  const db = getAppDatabase();
  const row = db.prepare("SELECT data FROM jira_ticket_tree WHERE root_key = ?").get(rootKey) as
    | { data: unknown }
    | undefined;
  if (!row) return null;
  return decodeStoredValue<JiraTicketTree>(row.data);
}

// 목적: 저장된 모든 티켓 트리를 반환한다.
export function loadAllTicketTrees(): JiraTicketTree[] {
  const db = getAppDatabase();
  const rows = db.prepare("SELECT data FROM jira_ticket_tree ORDER BY updated_at DESC").all() as Array<{
    data: unknown;
  }>;
  const result: JiraTicketTree[] = [];
  for (const row of rows) {
    const tree = decodeStoredValue<JiraTicketTree>(row.data);
    if (tree) result.push(tree);
  }
  return result;
}
