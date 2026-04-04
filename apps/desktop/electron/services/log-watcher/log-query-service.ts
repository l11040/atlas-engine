// 책임: SQLite에서 훅 로그를 조회하고 정규화된 HookLogEntry로 반환한다.

import type { HookLogEntry, LogQueryRequest, SessionSummary } from "../../../shared/ipc";
import { getAppDatabase } from "../storage/sqlite-db";

type SqlParam = string | number | null;

function parseForkMeta(result: string | null): { childAgentId?: string; childStatus?: string } {
  if (!result) return {};

  try {
    const parsed = JSON.parse(result) as { agentId?: string; status?: string };
    return {
      childAgentId: parsed.agentId,
      childStatus: parsed.status
    };
  } catch {
    const agentIdMatch = result.match(/"agentId"\s*:\s*"([^"]+)"/);
    const statusMatch = result.match(/"status"\s*:\s*"([^"]+)"/);
    return {
      childAgentId: agentIdMatch?.[1],
      childStatus: statusMatch?.[1]
    };
  }
}

// 목적: agent + skill 로그를 통합 조회한다.
export function queryAllLogs(filter: LogQueryRequest): HookLogEntry[] {
  const db = getAppDatabase();
  const entries: HookLogEntry[] = [];

  if (!filter.type || filter.type === "agent") {
    const conditions: string[] = [];
    const params: SqlParam[] = [];

    if (filter.sessionId) {
      conditions.push("session_id = ?");
      params.push(filter.sessionId);
    }
    if (filter.name) {
      conditions.push("agent_type = ?");
      params.push(filter.name);
    }
    if (filter.since) {
      conditions.push("start_time >= ?");
      params.push(filter.since);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filter.limit ? `LIMIT ${filter.limit}` : "";

    const rows = db.prepare(
      `SELECT id, session_id, agent_id, agent_type, start_time, end_time, duration_sec, last_message
       FROM hook_agent_logs ${where} ORDER BY start_time ASC ${limit}`
    ).all(...params) as Array<{
      id: number;
      session_id: string;
      agent_id: string;
      agent_type: string;
      start_time: string;
      end_time: string | null;
      duration_sec: number | null;
      last_message: string | null;
    }>;

    for (const row of rows) {
      entries.push({
        id: row.id,
        type: "agent",
        sessionId: row.session_id,
        name: row.agent_type,
        instanceKey: row.agent_id,
        startTime: row.start_time,
        endTime: row.end_time ?? undefined,
        durationSec: row.duration_sec ?? undefined,
        detail: row.last_message ?? undefined
      });
    }
  }

  if (!filter.type || filter.type === "skill") {
    const conditions: string[] = [];
    const params: SqlParam[] = [];

    if (filter.sessionId) {
      conditions.push("session_id = ?");
      params.push(filter.sessionId);
    }
    if (filter.name) {
      conditions.push("skill = ?");
      params.push(filter.name);
    }
    if (filter.since) {
      conditions.push("start_time >= ?");
      params.push(filter.since);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filter.limit ? `LIMIT ${filter.limit}` : "";

    const rows = db.prepare(
      `SELECT id, session_id, tool_use_id, skill, args, start_time, end_time, duration_sec, caller_agent_id, caller_agent_type, result
       FROM hook_skill_logs ${where} ORDER BY start_time ASC ${limit}`
    ).all(...params) as Array<{
      id: number;
      session_id: string;
      tool_use_id: string;
      skill: string;
      args: string | null;
      start_time: string;
      end_time: string | null;
      duration_sec: number | null;
      caller_agent_id: string | null;
      caller_agent_type: string | null;
      result: string | null;
    }>;

    for (const row of rows) {
      const forkMeta = parseForkMeta(row.result);
      entries.push({
        id: row.id,
        type: "skill",
        sessionId: row.session_id,
        name: row.skill,
        instanceKey: row.tool_use_id,
        startTime: row.start_time,
        endTime: row.end_time ?? undefined,
        durationSec: row.duration_sec ?? undefined,
        caller: row.caller_agent_id
          ? { agentId: row.caller_agent_id, agentType: row.caller_agent_type ?? "" }
          : undefined,
        args: row.args ?? undefined,
        childAgentId: forkMeta.childAgentId,
        childStatus: forkMeta.childStatus,
        detail: row.result ?? undefined
      });
    }
  }

  // 목적: 통합 결과를 start_time 순으로 정렬한다.
  entries.sort((a, b) => a.startTime.localeCompare(b.startTime));

  return entries;
}

// 목적: session_id별 그룹핑된 세션 목록을 반환한다.
export function querySessions(): SessionSummary[] {
  const db = getAppDatabase();

  const rows = db.prepare(`
    SELECT
      s.session_id,
      s.started_at,
      s.args,
      COALESCE(
        (SELECT MAX(end_time) FROM hook_agent_logs WHERE session_id = s.session_id),
        (SELECT MAX(end_time) FROM hook_skill_logs WHERE session_id = s.session_id),
        s.started_at
      ) AS ended_at,
      (SELECT COUNT(*) FROM hook_agent_logs WHERE session_id = s.session_id) AS agent_count,
      (SELECT COUNT(*) FROM hook_skill_logs WHERE session_id = s.session_id) AS skill_count
    FROM atlas_sessions s
    ORDER BY s.started_at DESC
  `).all() as Array<{
    session_id: string;
    started_at: string;
    args: string | null;
    ended_at: string;
    agent_count: number;
    skill_count: number;
  }>;

  return rows.map((row) => ({
    sessionId: row.session_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    agentCount: row.agent_count,
    skillCount: row.skill_count,
    args: row.args ?? undefined
  }));
}
