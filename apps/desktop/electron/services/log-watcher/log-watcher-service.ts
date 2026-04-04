// 책임: SQLite DB를 폴링하여 새 로그 항목을 감지하고 렌더러에 push 한다.
// 이유: JSONL 파일 감시는 cwd 의존성으로 신뢰성이 낮다. DB는 훅이 직접 쓰므로 cwd에 무관하다.

import { BrowserWindow } from "electron";
import { IPC_CHANNELS } from "../../../shared/ipc";
import type { HookLogEntry } from "../../../shared/ipc";
import { getAppDatabase } from "../storage/sqlite-db";

let pollInterval: ReturnType<typeof setInterval> | null = null;
let lastAgentRowId = 0;
let lastSkillId = 0;
let lastSessionCount = 0;

// 목적: INSERT된 후 아직 UPDATE(완료)되지 않은 에이전트를 추적한다.
// 이유: agent_stop 훅은 기존 행을 UPDATE하므로 id 기반 폴링으로는 감지 불가하다.
//       agent_id → DB row id 맵으로 완료 여부를 주기적으로 확인한다.
const runningAgents = new Map<string, number>(); // agent_id → row id
const runningSkills = new Map<string, number>(); // tool_use_id → row id

interface AgentRow {
  id: number;
  session_id: string;
  agent_id: string;
  agent_type: string;
  start_time: string;
  end_time: string | null;
  duration_sec: number | null;
  last_message: string | null;
}

interface SkillRow {
  id: number;
  session_id: string;
  tool_use_id: string;
  skill: string;
  args: string | null;
  caller_agent_id: string | null;
  caller_agent_type: string | null;
  start_time: string;
  end_time: string | null;
  duration_sec: number | null;
  result: string | null;
}

function agentRowToEntry(row: AgentRow): HookLogEntry {
  return {
    id: row.id,
    type: "agent",
    sessionId: row.session_id,
    name: row.agent_type,
    instanceKey: row.agent_id,
    startTime: row.start_time,
    endTime: row.end_time ?? undefined,
    durationSec: row.duration_sec ?? undefined,
    detail: row.last_message ?? undefined
  };
}

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

function skillRowToEntry(row: SkillRow): HookLogEntry {
  const forkMeta = parseForkMeta(row.result);

  return {
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
  };
}

// 목적: 마지막 확인 이후 추가·완료된 로그 행을 가져온다.
function pollNewEntries(): { entries: HookLogEntry[]; sessionChanged: boolean } {
  const db = getAppDatabase();
  const entries: HookLogEntry[] = [];
  let sessionChanged = false;

  try {
    // 1. 새로 INSERT된 에이전트 행 감지 (시작 이벤트)
    const newAgents = db.prepare(
      `SELECT id, session_id, agent_id, agent_type, start_time, end_time, duration_sec, last_message
       FROM hook_agent_logs WHERE id > ? ORDER BY id`
    ).all(lastAgentRowId) as unknown as AgentRow[];

    for (const row of newAgents) {
      lastAgentRowId = row.id;
      if (!row.end_time) {
        // 이유: end_time이 없으면 아직 실행 중이므로 추적 대상에 추가한다.
        runningAgents.set(row.agent_id, row.id);
      }
      entries.push(agentRowToEntry(row));
    }

    // 2. 실행 중 에이전트의 완료(UPDATE) 감지
    // 이유: agent_stop 훅은 기존 행을 UPDATE하므로 id 기반 폴링으로 감지 불가하다.
    //       runningAgents를 별도로 확인해 완료된 항목을 push한다.
    if (runningAgents.size > 0) {
      const agentIds = [...runningAgents.keys()];
      const placeholders = agentIds.map(() => "?").join(",");

      const completed = db.prepare(
        `SELECT id, session_id, agent_id, agent_type, start_time, end_time, duration_sec, last_message
         FROM hook_agent_logs
         WHERE agent_id IN (${placeholders}) AND end_time IS NOT NULL`
      ).all(...agentIds) as unknown as AgentRow[];

      for (const row of completed) {
        runningAgents.delete(row.agent_id);
        // 이유: 같은 id로 end_time이 채워진 완성된 항목을 push해 렌더러가 running → completed로 갱신할 수 있다.
        entries.push(agentRowToEntry(row));
      }
    }

    // 3. 새로 INSERT된 스킬 행 감지
    const skills = db.prepare(
      `SELECT id, session_id, tool_use_id, skill, args, caller_agent_id, caller_agent_type, start_time, end_time, duration_sec, result
       FROM hook_skill_logs WHERE id > ? ORDER BY id`
    ).all(lastSkillId) as unknown as SkillRow[];

    for (const row of skills) {
      lastSkillId = row.id;
      if (!row.end_time) {
        runningSkills.set(row.tool_use_id, row.id);
      }
      entries.push(skillRowToEntry(row));
    }

    // 4. 실행 중 스킬의 완료(UPDATE) 감지
    if (runningSkills.size > 0) {
      const toolUseIds = [...runningSkills.keys()];
      const placeholders = toolUseIds.map(() => "?").join(",");

      const completedSkills = db.prepare(
        `SELECT id, session_id, tool_use_id, skill, args, caller_agent_id, caller_agent_type, start_time, end_time, duration_sec, result
         FROM hook_skill_logs
         WHERE tool_use_id IN (${placeholders}) AND end_time IS NOT NULL`
      ).all(...toolUseIds) as unknown as SkillRow[];

      for (const row of completedSkills) {
        runningSkills.delete(row.tool_use_id);
        entries.push(skillRowToEntry(row));
      }
    }

    // 5. 세션 수 변화 감지
    const { count } = db.prepare(
      "SELECT COUNT(*) AS count FROM atlas_sessions"
    ).get() as { count: number };

    if (count !== lastSessionCount) {
      lastSessionCount = count;
      sessionChanged = true;
    }
  } catch {
    // 이유: DB 초기화 전 호출 등 일시적 오류는 무시한다.
  }

  return { entries, sessionChanged };
}

function broadcast(entries: HookLogEntry[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.logNewEntries, entries);
  }
}

// 목적: 앱 시작 시점의 baseline을 설정하고, 이미 실행 중인 에이전트를 추적 대상에 올린다.
function initBaseline(): void {
  const db = getAppDatabase();
  runningAgents.clear();
  runningSkills.clear();

  try {
    const a = db.prepare("SELECT COALESCE(MAX(id), 0) AS max_id FROM hook_agent_logs").get() as { max_id: number };
    const s = db.prepare("SELECT COALESCE(MAX(id), 0) AS max_id FROM hook_skill_logs").get() as { max_id: number };
    const ss = db.prepare("SELECT COUNT(*) AS count FROM atlas_sessions").get() as { count: number };
    lastAgentRowId = a.max_id;
    lastSkillId = s.max_id;
    lastSessionCount = ss.count;

    // 이유: 앱 재시작 시 이미 실행 중인 에이전트가 있으면 추적 대상에 올린다.
    const running = db.prepare(
      "SELECT agent_id, id FROM hook_agent_logs WHERE end_time IS NULL"
    ).all() as unknown as Array<{ agent_id: string; id: number }>;

    for (const row of running) {
      runningAgents.set(row.agent_id, row.id);
    }

    const runningSkillRows = db.prepare(
      "SELECT tool_use_id, id FROM hook_skill_logs WHERE end_time IS NULL"
    ).all() as unknown as Array<{ tool_use_id: string; id: number }>;

    for (const row of runningSkillRows) {
      runningSkills.set(row.tool_use_id, row.id);
    }
  } catch {
    lastAgentRowId = 0;
    lastSkillId = 0;
    lastSessionCount = 0;
  }
}

export function startLogWatcher(_cwd: string): void {
  stopLogWatcher();
  initBaseline();

  pollInterval = setInterval(() => {
    const { entries, sessionChanged } = pollNewEntries();
    // 이유: entries가 없어도 세션이 새로 생기면 빈 배열을 push해 세션 목록 갱신을 트리거한다.
    if (entries.length > 0 || sessionChanged) {
      broadcast(entries);
    }
  }, 1000);
}

export function stopLogWatcher(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}
