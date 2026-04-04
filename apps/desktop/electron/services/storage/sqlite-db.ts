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

// 목적: 스키마 변경이 필요한 경우 마이그레이션을 실행한다.
// 이유: SQLite는 ALTER TABLE로 제약 변경이 불가하므로 테이블 재생성으로 처리한다.
function migrateSchema(database: NodeDatabaseSync): void {
  const agentInfo = database.prepare("PRAGMA table_info(hook_agent_logs)").all() as Array<{
    name: string;
    notnull: number;
  }>;

  // Migration 1: end_time NOT NULL → nullable
  const endTimeCol = agentInfo.find((c) => c.name === "end_time");
  const needsNullable = endTimeCol && endTimeCol.notnull !== 0;

  // Migration 2: agent_id UNIQUE 제약 추가 여부 확인
  const agentTableInfo = database.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='hook_agent_logs'"
  ).get() as { sql: string } | undefined;
  const needsAgentUnique = !agentTableInfo?.sql?.includes("agent_id TEXT NOT NULL UNIQUE");

  if (needsNullable || needsAgentUnique) {
    database.exec(`
      BEGIN;
      ALTER TABLE hook_agent_logs RENAME TO hook_agent_logs_old;
      CREATE TABLE hook_agent_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL UNIQUE,
        agent_type TEXT NOT NULL,
        cwd TEXT,
        permission_mode TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration_sec INTEGER,
        transcript_path TEXT,
        last_message TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      -- 이유: agent_id 기준으로 최신 행(end_time 있는 것 우선)만 보존한다.
      INSERT OR IGNORE INTO hook_agent_logs
        SELECT * FROM hook_agent_logs_old
        WHERE id IN (
          SELECT CASE
            WHEN MAX(CASE WHEN end_time IS NOT NULL THEN id END) IS NOT NULL
              THEN MAX(CASE WHEN end_time IS NOT NULL THEN id END)
            ELSE MAX(id)
          END
          FROM hook_agent_logs_old
          GROUP BY agent_id
        );
      DROP TABLE hook_agent_logs_old;
      CREATE INDEX IF NOT EXISTS idx_agent_logs_session ON hook_agent_logs(session_id);
      CREATE INDEX IF NOT EXISTS idx_agent_logs_type ON hook_agent_logs(agent_type);
      COMMIT;
    `);
  }

  const skillInfo = database.prepare("PRAGMA table_info(hook_skill_logs)").all() as Array<{
    name: string;
    notnull: number;
  }>;
  const skillEndTimeCol = skillInfo.find((c) => c.name === "end_time");
  const skillDurationCol = skillInfo.find((c) => c.name === "duration_sec");
  const needsSkillEndNullable = skillEndTimeCol && skillEndTimeCol.notnull !== 0;
  const needsSkillDurationNullable = skillDurationCol && skillDurationCol.notnull !== 0;

  // Migration 3: hook_skill_logs.tool_use_id UNIQUE 제약 + running row(nullable end/duration) 지원
  const skillTableInfo = database.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='hook_skill_logs'"
  ).get() as { sql: string } | undefined;
  const needsSkillUnique = !skillTableInfo?.sql?.includes("tool_use_id TEXT NOT NULL UNIQUE");

  if (needsSkillUnique || needsSkillEndNullable || needsSkillDurationNullable) {
    database.exec(`
      BEGIN;
      ALTER TABLE hook_skill_logs RENAME TO hook_skill_logs_old;
      CREATE TABLE hook_skill_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        tool_use_id TEXT NOT NULL UNIQUE,
        skill TEXT NOT NULL,
        args TEXT,
        cwd TEXT,
        permission_mode TEXT,
        caller_agent_id TEXT,
        caller_agent_type TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration_sec INTEGER,
        result TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      -- 이유: tool_use_id 기준으로 completed row를 우선 보존하고, 없으면 최신 row를 보존한다.
      INSERT OR IGNORE INTO hook_skill_logs
        SELECT * FROM hook_skill_logs_old
        WHERE id IN (
          SELECT CASE
            WHEN MAX(CASE WHEN end_time IS NOT NULL THEN id END) IS NOT NULL
              THEN MAX(CASE WHEN end_time IS NOT NULL THEN id END)
            ELSE MAX(id)
          END
          FROM hook_skill_logs_old
          GROUP BY tool_use_id
        );
      DROP TABLE hook_skill_logs_old;
      CREATE INDEX IF NOT EXISTS idx_skill_logs_session ON hook_skill_logs(session_id);
      CREATE INDEX IF NOT EXISTS idx_skill_logs_skill ON hook_skill_logs(skill);
      COMMIT;
    `);
  }
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

    -- 에이전트 실행 로그
    -- 주의: end_time/duration_sec은 start 훅에서 NULL로 INSERT되고 stop 훅에서 UPDATE된다.
    CREATE TABLE IF NOT EXISTS hook_agent_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      agent_type TEXT NOT NULL,
      cwd TEXT,
      permission_mode TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration_sec INTEGER,
      transcript_path TEXT,
      last_message TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_agent_logs_session ON hook_agent_logs(session_id);
    CREATE INDEX IF NOT EXISTS idx_agent_logs_type ON hook_agent_logs(agent_type);

    -- 스킬 실행 로그
    -- 주의: end_time/duration_sec은 pre 훅에서 NULL로 INSERT되고 post 훅에서 UPDATE된다.
    CREATE TABLE IF NOT EXISTS hook_skill_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      tool_use_id TEXT NOT NULL,
      skill TEXT NOT NULL,
      args TEXT,
      cwd TEXT,
      permission_mode TEXT,
      caller_agent_id TEXT,
      caller_agent_type TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration_sec INTEGER,
      result TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_skill_logs_session ON hook_skill_logs(session_id);
    CREATE INDEX IF NOT EXISTS idx_skill_logs_skill ON hook_skill_logs(skill);

    -- Atlas 세션 기록
    CREATE TABLE IF NOT EXISTS atlas_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      started_at TEXT NOT NULL,
      args TEXT,
      cwd TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- 파이프라인 정의 저장
    CREATE TABLE IF NOT EXISTS pipeline_definitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
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
  migrateSchema(db);
  return db;
}

// 목적: 앱 종료 시 DB 연결을 명시적으로 닫는다.
export function closeAppDatabase(): void {
  if (!db) return;
  db.close();
  db = null;
}
