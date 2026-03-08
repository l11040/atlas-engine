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

    CREATE TABLE IF NOT EXISTS flow_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data BLOB NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS todo_flow_states (
      todo_id TEXT PRIMARY KEY,
      data BLOB NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS todo_flow_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      todo_id TEXT NOT NULL,
      entry BLOB NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_todo_flow_activity_todo_id
    ON todo_flow_activity (todo_id, id);
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
