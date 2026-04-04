// 책임: 파이프라인 정의와 로그를 기준으로 각 노드의 상태를 계산한다.
import { useMemo } from "react";
import type { HookLogEntry, NodeStatus, PipelineDefinition } from "@shared/ipc";
import {
  collectChildAgentIds,
  resolveAtlasTaskDesignCount,
  resolveRootAgentLogsForName
} from "@/lib/pipeline-execution";

function resolveStatusForLogs(
  logs: HookLogEntry[],
  options?: {
    plannedExecutionCount?: number | null;
  }
): NodeStatus {
  if (logs.length === 0) return "pending";
  if (logs.some((log) => !log.endTime)) return "running";
  if (options?.plannedExecutionCount != null && logs.length < options.plannedExecutionCount) {
    return "running";
  }
  return "completed";
}

function resolveNodeLogs(
  node: PipelineDefinition["nodes"][number],
  logs: HookLogEntry[],
  childAgentIds: Set<string>
): HookLogEntry[] {
  if (node.type === "skill") {
    return logs.filter((entry) => entry.type === "skill" && entry.name === node.id);
  }

  if (node.parentId) {
    return logs.filter((entry) => entry.type === "agent" && entry.name === node.id);
  }

  return resolveRootAgentLogsForName(node.id, logs, childAgentIds);
}

export function useNodeStatus(
  logs: HookLogEntry[],
  pipeline: PipelineDefinition | null
): Record<string, NodeStatus> {
  return useMemo(() => {
    if (!pipeline) return {};

    const statusMap: Record<string, NodeStatus> = {};
    const childAgentIds = collectChildAgentIds(logs);
    const plannedExecuteCount = resolveAtlasTaskDesignCount(logs);

    for (const node of pipeline.nodes) {
      const relevantLogs = resolveNodeLogs(node, logs, childAgentIds);
      statusMap[node.id] = resolveStatusForLogs(relevantLogs, {
        plannedExecutionCount: node.id === "atlas-execute" ? plannedExecuteCount : null
      });
    }

    return statusMap;
  }, [logs, pipeline]);
}
