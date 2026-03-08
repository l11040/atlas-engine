// 책임: Electron 메인 프로세스에서 공용 SQLite DB 연결과 스키마 초기화를 제공한다.

import { app } from "electron";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";

const DB_FILENAME = "atlas.db";
const runtimeRequire = createRequire(__filename);

type SqliteModule = {
  DatabaseSync: new (path: string) => NodeDatabaseSync;
};

let db: NodeDatabaseSync | null = null;

function loadSqliteModule(): SqliteModule {
  const fromBuiltin = (process as unknown as { getBuiltinModule?: (id: string) => unknown })
    .getBuiltinModule?.("node:sqlite") as SqliteModule | undefined;
  if (fromBuiltin?.DatabaseSync) return fromBuiltin;

  // 이유: 번들러가 node:sqlite를 sqlite로 잘못 치환하는 문제를 피하기 위해 런타임 require를 사용한다.
  return runtimeRequire("node:sqlite") as SqliteModule;
}

function getDatabasePath(): string {
  return path.join(app.getPath("userData"), DB_FILENAME);
}

function ensureSchema(database: NodeDatabaseSync): void {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data BLOB NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // 목적: 기존 싱글턴 테이블(id INTEGER)을 다중 저장(root_key TEXT)으로 마이그레이션한다.
  // 이유: CREATE TABLE IF NOT EXISTS는 스키마가 다른 기존 테이블을 무시하므로, 컬럼 존재 여부로 판별한다.
  const cols = database.prepare("PRAGMA table_info(jira_ticket_tree)").all() as Array<{ name: string }>;
  if (cols.length > 0 && !cols.some((c) => c.name === "root_key")) {
    database.exec("DROP TABLE jira_ticket_tree");
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS jira_ticket_tree (
      root_key TEXT PRIMARY KEY,
      data BLOB NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      data BLOB NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_executions (
      task_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(run_id),
      data BLOB NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS execution_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      data BLOB NOT NULL,
      archived_at INTEGER NOT NULL
    );
  `);
}

// 목적: 공용 DB 연결을 lazy-initialize 하여 재사용한다.
export function getAppDatabase(): NodeDatabaseSync {
  if (db) return db;

  const dbPath = getDatabasePath();
  mkdirSync(path.dirname(dbPath), { recursive: true });

  const sqlite = loadSqliteModule();
  db = new sqlite.DatabaseSync(dbPath);
  ensureSchema(db);
  return db;
}

// 목적: 앱 종료 시 DB 연결을 명시적으로 닫는다.
export function closeAppDatabase(): void {
  if (!db) return;
  db.close();
  db = null;
}
