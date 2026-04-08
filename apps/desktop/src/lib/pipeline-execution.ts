import type { HookLogEntry } from "@shared/ipc";

const PENDING_CHILD_MATCH_WINDOW_MS = 3000;
const TASK_DESIGN_COUNT_PATTERNS = [
  /-\s+\*\*제목\*\*:\s*(\d+)\s*개 태스크 설계 완료/m,
  /(\d+)\s*개 태스크 설계 완료/m
];

function parseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function extractLogResultText(detail: string | undefined): string | null {
  if (!detail) return null;

  const trimmed = detail.trim();
  if (!trimmed) return null;

  const rootValue = parseJson(trimmed);
  if (
    rootValue &&
    typeof rootValue === "object" &&
    !Array.isArray(rootValue) &&
    "result" in rootValue &&
    typeof rootValue.result === "string"
  ) {
    return rootValue.result;
  }

  return trimmed;
}

export function resolveAtlasTaskDesignCount(logs: HookLogEntry[]): number | null {
  const latestTaskDesignLog = [...logs]
    .filter((entry) => entry.type === "skill" && entry.name === "atlas-analyze-task-design")
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .at(-1);

  const resultText = extractLogResultText(latestTaskDesignLog?.detail);
  if (!resultText) return null;

  for (const pattern of TASK_DESIGN_COUNT_PATTERNS) {
    const match = resultText.match(pattern);
    if (match?.[1]) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  const taskMatches = resultText.match(/\|\s*TASK-\d+/g);
  return taskMatches && taskMatches.length > 0 ? taskMatches.length : null;
}

export function collectChildAgentIds(logs: HookLogEntry[]): Set<string> {
  const childAgentIds = new Set(
    logs
      .filter((entry) => entry.type === "skill" && entry.childAgentId)
      .map((entry) => entry.childAgentId!)
  );

  const agentLogs = logs
    .filter((entry): entry is HookLogEntry & { type: "agent"; instanceKey: string } =>
      entry.type === "agent" && typeof entry.instanceKey === "string" && entry.instanceKey.length > 0
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const runningForkSkills = logs
    .filter((entry): entry is HookLogEntry & { type: "skill" } =>
      entry.type === "skill" &&
      !entry.childAgentId &&
      !entry.endTime &&
      !!entry.caller
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  for (const skill of runningForkSkills) {
    const caller = skill.caller;
    if (!caller) continue;

    const skillStartMs = new Date(skill.startTime).getTime();
    const candidates = agentLogs.filter((agent) => {
      if (childAgentIds.has(agent.instanceKey)) return false;
      if (agent.instanceKey === caller.agentId) return false;
      if (agent.name !== caller.agentType) return false;

      const agentStartMs = new Date(agent.startTime).getTime();
      return agentStartMs >= skillStartMs && agentStartMs <= skillStartMs + PENDING_CHILD_MATCH_WINDOW_MS;
    });

    if (candidates.length === 1) {
      childAgentIds.add(candidates[0]!.instanceKey);
    }
  }

  return childAgentIds;
}

export function resolveRootAgentLogsForName(
  nodeId: string,
  logs: HookLogEntry[],
  childAgentIds: Set<string> = collectChildAgentIds(logs)
): HookLogEntry[] {
  const agentLogs = logs.filter((entry) => entry.type === "agent" && entry.name === nodeId);
  const rootAgentLogs = agentLogs.filter((entry) => !entry.instanceKey || !childAgentIds.has(entry.instanceKey));
  return rootAgentLogs.length > 0 ? rootAgentLogs : agentLogs;
}

export function getAgentExecutionOrdinal(
  agentLog: HookLogEntry,
  logs: HookLogEntry[],
  childAgentIds: Set<string> = collectChildAgentIds(logs)
): { index: number; total: number } {
  const rootLogs = resolveRootAgentLogsForName(agentLog.name, logs, childAgentIds)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const foundIndex = rootLogs.findIndex((entry) => entry.id === agentLog.id);
  return {
    index: foundIndex >= 0 ? foundIndex + 1 : 1,
    total: rootLogs.length
  };
}

export function formatAgentExecutionLabel(
  baseLabel: string,
  agentLog: HookLogEntry,
  logs: HookLogEntry[],
  childAgentIds: Set<string> = collectChildAgentIds(logs)
): string {
  const { index, total } = getAgentExecutionOrdinal(agentLog, logs, childAgentIds);
  return total > 1 ? `${baseLabel} #${index}` : baseLabel;
}

export function formatSkillExecutionLabel(
  parentLabel: string | undefined,
  skillLabel: string,
  skillLog: HookLogEntry,
  logs: HookLogEntry[],
  childAgentIds: Set<string> = collectChildAgentIds(logs)
): string {
  const caller = skillLog.caller;
  if (!caller) return skillLabel;

  const parentAgentLog = logs.find(
    (entry) => entry.type === "agent" && entry.instanceKey === caller.agentId
  );
  if (!parentAgentLog) return skillLabel;

  const { index, total } = getAgentExecutionOrdinal(parentAgentLog, logs, childAgentIds);
  if (total <= 1) return skillLabel;

  return parentLabel ? `${parentLabel} #${index} · ${skillLabel}` : `#${index} · ${skillLabel}`;
}
