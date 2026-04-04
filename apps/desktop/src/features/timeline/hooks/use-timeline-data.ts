// 책임: 로그 + 파이프라인 정의를 계층형 타임라인 행 데이터로 변환한다.
import { useEffect, useMemo, useState } from "react";
import type { HookLogEntry, PipelineDefinition, NodeStatus } from "@shared/ipc";
import { collectChildAgentIds, formatSkillExecutionLabel } from "@/lib/pipeline-execution";

export interface TimelineRowBar {
  startMs: number;
  endMs: number;
  durationSec: number;
  leftPercent: number;
  widthPercent: number;
  status: NodeStatus;
}

export interface TimelineRow {
  rowId: string;
  nodeId: string;
  label: string;
  type: "agent" | "skill";
  selectedLogId?: number;
  selectedLogType?: HookLogEntry["type"];
  // 0 = top-level, 1 = skill under agent
  depth: number;
  parentId?: string;
  // null = 로그 없음 (pending)
  bar: TimelineRowBar | null;
}

export interface TimelineData {
  rows: TimelineRow[];
  totalDurationSec: number;
  minStartMs: number;
  maxEndMs: number;
}

interface ResolvedNodeWindow {
  startMs: number;
  endMs: number;
  status: NodeStatus;
}

interface TimelineRowSeed {
  rowId: string;
  nodeId: string;
  label: string;
  type: "agent" | "skill";
  selectedLogId?: number;
  selectedLogType?: HookLogEntry["type"];
  depth: number;
  parentId?: string;
  window?: ResolvedNodeWindow;
  sortKey?: string;
}

export function useTimelineData(
  logs: HookLogEntry[],
  pipeline: PipelineDefinition | null,
  nodeStatuses: Record<string, NodeStatus>
): TimelineData {
  const hasRunningLogs = logs.some((entry) => !entry.endTime);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!hasRunningLogs) return;

    setNowMs(Date.now());
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [hasRunningLogs]);

  return useMemo(() => {
    const empty: TimelineData = { rows: [], totalDurationSec: 0, minStartMs: 0, maxEndMs: 0 };
    if (!pipeline) return empty;

    // 자식 맵 + 노드 맵 구성
    const childrenMap = new Map<string, string[]>();
    const nodeMap = new Map<string, (typeof pipeline.nodes)[number]>();
    for (const node of pipeline.nodes) {
      nodeMap.set(node.id, node);
      if (node.parentId) {
        const arr = childrenMap.get(node.parentId) ?? [];
        arr.push(node.id);
        childrenMap.set(node.parentId, arr);
      }
    }

    const childAgentIds = collectChildAgentIds(logs);

    const windowsByNode = new Map<string, ResolvedNodeWindow>();
    for (const node of pipeline.nodes) {
      const relevantLogs = resolveLogsForNode(node, logs, childAgentIds);
      const window = buildWindowForLogs(relevantLogs, nodeStatuses[node.id] ?? "pending", nowMs);
      if (window) {
        windowsByNode.set(node.id, window);
      }
    }

    const rowSeeds: TimelineRowSeed[] = [];
    for (const node of pipeline.nodes) {
      if (node.parentId) continue;

      rowSeeds.push({
        rowId: node.id,
        nodeId: node.id,
        label: node.label,
        type: node.type as "agent" | "skill",
        depth: 0,
        window: windowsByNode.get(node.id)
      });

      const childIds = childrenMap.get(node.id) ?? [];
      const executedChildren: TimelineRowSeed[] = [];
      const pendingChildren: TimelineRowSeed[] = [];

      for (const childId of childIds) {
        const child = nodeMap.get(childId);
        if (!child) continue;

        const childLogs = logs
          .filter((entry) => entry.type === "skill" && entry.name === childId)
          .sort((a, b) => a.startTime.localeCompare(b.startTime));

        if (childLogs.length === 0) {
          pendingChildren.push({
            rowId: childId,
            nodeId: childId,
            label: child.label,
            type: "skill",
            depth: 1,
            parentId: node.id
          });
          continue;
        }

        childLogs.forEach((log, index) => {
          const instanceSuffix = log.instanceKey ?? `${index + 1}`;
          executedChildren.push({
            rowId: `${childId}::${instanceSuffix}`,
            nodeId: childId,
            label: formatSkillExecutionLabel(node.label, child.label, log, logs, childAgentIds),
            type: "skill",
            selectedLogId: log.id,
            selectedLogType: log.type,
            depth: 1,
            parentId: node.id,
            window: buildWindowForLogs([log], nodeStatuses[childId] ?? "pending", nowMs) ?? undefined,
            sortKey: `${log.startTime}:${childId}:${instanceSuffix}`
          });
        });
      }

      executedChildren.sort((a, b) => (a.sortKey ?? "").localeCompare(b.sortKey ?? ""));
      rowSeeds.push(...executedChildren, ...pendingChildren);
    }

    const validWindows = rowSeeds
      .map((row) => row.window)
      .filter((window): window is ResolvedNodeWindow => Boolean(window));
    const minStartMs =
      validWindows.length > 0 ? Math.min(...validWindows.map((w) => w.startMs)) : 0;
    const maxEndMs =
      validWindows.length > 0 ? Math.max(...validWindows.map((w) => w.endMs)) : 0;
    const totalMs = Math.max(maxEndMs - minStartMs, 1);
    const totalDurationSec = Math.round(totalMs / 1000);

    const rows = rowSeeds.map((row) => buildRow(row, minStartMs, totalMs));

    return { rows, totalDurationSec, minStartMs, maxEndMs };
  }, [logs, nowMs, pipeline, nodeStatuses]);
}

function buildRow(
  row: TimelineRowSeed,
  minStartMs: number,
  totalMs: number
): TimelineRow {
  const { rowId, nodeId, label, type, selectedLogId, selectedLogType, depth, parentId, window } = row;

  if (!window) {
    return { rowId, nodeId, label, type, selectedLogId, selectedLogType, depth, parentId, bar: null };
  }

  const startMs = window.startMs;
  const endMs = window.endMs;
  const durationMs = Math.max(endMs - startMs, 0);

  return {
    rowId, nodeId, label, type, selectedLogId, selectedLogType, depth, parentId,
    bar: {
      startMs, endMs,
      durationSec: Math.round(durationMs / 1000),
      leftPercent: totalMs > 1 ? ((startMs - minStartMs) / totalMs) * 100 : 0,
      widthPercent: totalMs > 1 ? Math.max((durationMs / totalMs) * 100, 0.5) : 100,
      status: window.status
    }
  };
}

function resolveLogsForNode(
  node: PipelineDefinition["nodes"][number],
  logs: HookLogEntry[],
  childAgentIds: Set<string>
): HookLogEntry[] {
  if (node.type === "skill") {
    return logs.filter((entry) => entry.type === "skill" && entry.name === node.id);
  }

  const agentLogs = logs.filter((entry) => entry.type === "agent" && entry.name === node.id);
  if (node.parentId) {
    return agentLogs;
  }

  // 이유: 최상위 phase(agent)는 skill fork가 만든 하위 agent와 분리해서 해석해야 한다.
  const rootAgentLogs = agentLogs.filter((entry) => !entry.instanceKey || !childAgentIds.has(entry.instanceKey));
  return rootAgentLogs.length > 0 ? rootAgentLogs : agentLogs;
}

function buildWindowForLogs(
  logs: HookLogEntry[],
  fallbackStatus: NodeStatus,
  nowMs: number
): ResolvedNodeWindow | null {
  if (logs.length === 0) return null;

  const started = logs
    .filter((entry) => entry.startTime)
    .map((entry) => new Date(entry.startTime).getTime());

  if (started.length === 0) return null;

  const hasRunning = logs.some((entry) => !entry.endTime);
  const ended = logs
    .map((entry) => (entry.endTime ? new Date(entry.endTime).getTime() : null))
    .filter((value): value is number => value !== null);

  const startMs = Math.min(...started);
  const endMs = hasRunning ? nowMs : (ended.length > 0 ? Math.max(...ended) : startMs);

  const status: NodeStatus = hasRunning
    ? "running"
    : fallbackStatus === "running"
      ? "running"
      : logs.some((entry) => entry.endTime)
        ? "completed"
        : fallbackStatus;

  return { startMs, endMs, status };
}
