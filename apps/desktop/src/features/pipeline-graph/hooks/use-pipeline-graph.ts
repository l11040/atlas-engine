// 책임: PipelineDefinition + 로그 관계를 ReactFlow 노드/엣지로 변환한다.
import { useMemo } from "react";
import dagre from "dagre";
import type { Edge, Node } from "@xyflow/react";
import type { HookLogEntry, NodeStatus, PipelineDefinition } from "@shared/ipc";
import { collectChildAgentIds, resolveRootAgentLogsForName } from "@/lib/pipeline-execution";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 48;
const GROUP_WIDTH_MIN = 280;
const GROUP_WIDTH_MAX = 360;
const GROUP_PADDING_Y = 18;
const GROUP_HEADER_H = 52;
const GROUP_HEADER_GAP = 12;
const EXECUTION_ROW_H = 38;
const EXECUTION_ROW_GAP = 8;
const DETAIL_PADDING_Y = 10;
const DETAIL_SKILL_ROW_H = 34;
const DETAIL_BORDER_H = 1;
const GROUP_FOOTER_BUFFER = 6;

interface UseGraphResult {
  nodes: Node[];
  edges: Edge[];
}

interface GraphSelection {
  nodeId: string | null;
  logId: number | null;
  logType: HookLogEntry["type"] | null;
}

interface GraphSelectHandler {
  (nodeId: string | null, selectedLogId?: number | null, selectedLogType?: "agent" | "skill" | null): void;
}

interface GraphExecutionToggleHandler {
  (nodeId: string, executionId: string | null): void;
}

interface RenderedSkillItem {
  id: string;
  baseNodeId: string;
  label: string;
  status: NodeStatus;
  logId?: number;
}

interface RenderedExecutionRow {
  id: string;
  label: string;
  status: NodeStatus;
  agentLogId?: number;
  metaLabel?: string;
  durationLabel?: string;
  items: RenderedSkillItem[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function resolveDurationSec(entry: HookLogEntry): number | null {
  if (typeof entry.durationSec === "number" && Number.isFinite(entry.durationSec)) {
    return Math.max(Math.round(entry.durationSec), 0);
  }

  const startMs = new Date(entry.startTime).getTime();
  const endMs = entry.endTime ? new Date(entry.endTime).getTime() : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null;
  }

  return Math.max(Math.round((endMs - startMs) / 1000), 0);
}

function formatDurationLabel(durationSec: number | null): string | undefined {
  if (durationSec == null) return undefined;
  if (durationSec < 60) return `${durationSec}s`;

  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  if (minutes < 60) {
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}

function estimateGroupWidth(
  parentNode: PipelineDefinition["nodes"][number],
  executions: RenderedExecutionRow[]
): number {
  const labels = [
    parentNode.label,
    ...executions.map((execution) => execution.label),
    ...executions.flatMap((execution) => execution.items.map((item) => item.label))
  ];

  if (labels.length === 0) {
    return GROUP_WIDTH_MIN;
  }

  const maxLabelLength = Math.max(...labels.map((label) => label.length));
  return clamp(maxLabelLength * 8 + 172, GROUP_WIDTH_MIN, GROUP_WIDTH_MAX);
}

function resolveLatestSkillLogForChild(skillLogs: HookLogEntry[], childId: string): HookLogEntry | undefined {
  for (let index = skillLogs.length - 1; index >= 0; index -= 1) {
    const entry = skillLogs[index];
    if (entry?.name === childId) {
      return entry;
    }
  }

  return undefined;
}

function buildExecutionRows(
  parentNode: PipelineDefinition["nodes"][number],
  childIds: string[],
  nodeById: Map<string, PipelineDefinition["nodes"][number]>,
  logs: HookLogEntry[],
  childAgentIds: Set<string>
): RenderedExecutionRow[] {
  const rootAgentLogs = resolveRootAgentLogsForName(parentNode.id, logs, childAgentIds).sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
  );

  if (rootAgentLogs.length === 0) {
    return childIds.length === 0
      ? []
      : [
          {
            id: `${parentNode.id}::planned`,
            label: "예정됨",
            status: "pending",
            metaLabel: `${childIds.length}개 단계`,
            items: childIds.map((childId) => ({
              id: `${childId}::pending`,
              baseNodeId: childId,
              label: nodeById.get(childId)?.label ?? childId,
              status: "pending" satisfies NodeStatus
            }))
          }
        ];
  }

  return rootAgentLogs.map((agentLog, index) => {
    const agentSkillLogs = logs
      .filter(
        (entry) =>
          entry.type === "skill" &&
          entry.caller !== undefined &&
          entry.caller !== "orchestrator" &&
          entry.caller.agentId === agentLog.instanceKey &&
          childIds.includes(entry.name)
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    const executedChildIds = new Set(agentSkillLogs.map((entry) => entry.name));
    const items = childIds.map((childId) => {
      const childNode = nodeById.get(childId);
      const latestLog = resolveLatestSkillLogForChild(agentSkillLogs, childId);

      return {
        id: latestLog ? `${childId}::${latestLog.id}` : `${childId}::${agentLog.id ?? index + 1}::pending`,
        baseNodeId: childId,
        label: childNode?.label ?? childId,
        status: latestLog ? (latestLog.endTime ? "completed" : "running") : "pending",
        logId: latestLog?.id
      } satisfies RenderedSkillItem;
    });

    return {
      id: `${parentNode.id}::execution::${agentLog.id ?? agentLog.instanceKey ?? index + 1}`,
      label: `#${index + 1}`,
      status: agentLog.endTime ? "completed" : "running",
      agentLogId: agentLog.id,
      durationLabel: formatDurationLabel(resolveDurationSec(agentLog)),
      metaLabel: childIds.length > 0 ? `${executedChildIds.size}/${childIds.length} 단계` : undefined,
      items
    } satisfies RenderedExecutionRow;
  });
}

function resolveExpandedExecutionId(
  parentNodeId: string,
  executions: RenderedExecutionRow[],
  expandedExecutionIds: Record<string, string | null>
): string | null {
  if (Object.prototype.hasOwnProperty.call(expandedExecutionIds, parentNodeId)) {
    const requestedExecutionId = expandedExecutionIds[parentNodeId];
    if (requestedExecutionId == null) {
      return null;
    }

    const matchedExecution = executions.find((execution) => execution.id === requestedExecutionId);
    return matchedExecution?.id ?? null;
  }

  const runningExecution = [...executions].reverse().find((execution) => execution.status === "running");
  if (runningExecution) {
    return runningExecution.id;
  }

  return executions.length === 1 ? executions[0]!.id : null;
}

function getGroupHeight(executions: RenderedExecutionRow[], expandedExecutionId: string | null): number {
  if (executions.length === 0) {
    return NODE_HEIGHT;
  }

  const executionRowsHeight = executions.reduce((total, execution, index) => {
    const detailHeight =
      execution.id === expandedExecutionId
        ? DETAIL_BORDER_H +
          DETAIL_PADDING_Y * 2 +
          execution.items.length * DETAIL_SKILL_ROW_H +
          Math.max(execution.items.length - 1, 0) * 4
        : 0;

    return total + EXECUTION_ROW_H + detailHeight + (index < executions.length - 1 ? EXECUTION_ROW_GAP : 0);
  }, 0);

  return GROUP_PADDING_Y * 2 + GROUP_HEADER_H + GROUP_HEADER_GAP + executionRowsHeight + GROUP_FOOTER_BUFFER;
}

function layoutGraph(
  definition: PipelineDefinition,
  logs: HookLogEntry[],
  nodeStatuses: Record<string, NodeStatus>,
  selection: GraphSelection,
  onNodeSelect?: GraphSelectHandler,
  expandedExecutionIds: Record<string, string | null> = {},
  onExecutionToggle?: GraphExecutionToggleHandler
): UseGraphResult {
  const nodeById = new Map<string, PipelineDefinition["nodes"][number]>();
  const childrenMap = new Map<string, string[]>();
  const childAgentIds = collectChildAgentIds(logs);

  for (const node of definition.nodes) {
    nodeById.set(node.id, node);
    if (!node.parentId) continue;
    const children = childrenMap.get(node.parentId) ?? [];
    children.push(node.id);
    childrenMap.set(node.parentId, children);
  }

  const executionsByParent = new Map<string, RenderedExecutionRow[]>();
  const expandedExecutionByParent = new Map<string, string | null>();
  const widthByParent = new Map<string, number>();
  const heightByParent = new Map<string, number>();

  for (const node of definition.nodes) {
    if (node.parentId) continue;

    const childIds = childrenMap.get(node.id) ?? [];
    if (childIds.length === 0) continue;

    const executions = buildExecutionRows(node, childIds, nodeById, logs, childAgentIds);
    const expandedExecutionId = resolveExpandedExecutionId(node.id, executions, expandedExecutionIds);
    const width = estimateGroupWidth(node, executions);
    const height = getGroupHeight(executions, expandedExecutionId);

    executionsByParent.set(node.id, executions);
    expandedExecutionByParent.set(node.id, expandedExecutionId);
    widthByParent.set(node.id, width);
    heightByParent.set(node.id, height);
  }

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 100 });
  const incomingCounts = new Map<string, number>();
  const outgoingCounts = new Map<string, number>();

  for (const node of definition.nodes) {
    if (node.parentId) continue;

    const executions = executionsByParent.get(node.id) ?? [];
    const width = executions.length > 0 ? widthByParent.get(node.id) ?? GROUP_WIDTH_MIN : NODE_WIDTH;
    const height = executions.length > 0 ? heightByParent.get(node.id) ?? NODE_HEIGHT : NODE_HEIGHT;
    g.setNode(node.id, { width, height });
  }

  const topLevelIds = new Set(definition.nodes.filter((node) => !node.parentId).map((node) => node.id));
  for (const edge of definition.edges) {
    if (topLevelIds.has(edge.source) && topLevelIds.has(edge.target)) {
      g.setEdge(edge.source, edge.target);
      outgoingCounts.set(edge.source, (outgoingCounts.get(edge.source) ?? 0) + 1);
      incomingCounts.set(edge.target, (incomingCounts.get(edge.target) ?? 0) + 1);
    }
  }

  dagre.layout(g);

  const nodes: Node[] = [];

  for (const node of definition.nodes) {
    if (node.parentId) continue;

    const dagreNode = g.node(node.id);
    const executions = executionsByParent.get(node.id) ?? [];
    const expandedExecutionId = expandedExecutionByParent.get(node.id) ?? null;
    const rootStatus = nodeStatuses[node.id] ?? "pending";
    const childIds = childrenMap.get(node.id) ?? [];
    const hasIncoming = (incomingCounts.get(node.id) ?? 0) > 0;
    const hasOutgoing = (outgoingCounts.get(node.id) ?? 0) > 0;
    const x = (dagreNode?.x ?? 0) - (dagreNode?.width ?? NODE_WIDTH) / 2;
    const y = (dagreNode?.y ?? 0) - (dagreNode?.height ?? NODE_HEIGHT) / 2;

    if (executions.length === 0) {
      nodes.push({
        id: node.id,
        type: "agent",
        position: { x, y },
        selected: selection.nodeId === node.id && selection.logId == null,
        data: {
          label: node.label,
          status: rootStatus,
          nodeType: node.type,
          baseNodeId: node.id,
          hasIncoming,
          hasOutgoing
        }
      });
      continue;
    }

    const childStatuses = executions.flatMap((execution) => [execution.status, ...execution.items.map((item) => item.status)]);
    const groupStatus: NodeStatus =
      rootStatus === "running" || childStatuses.some((status) => status === "running")
        ? "running"
        : rootStatus === "failed" || childStatuses.some((status) => status === "failed")
          ? "failed"
          : rootStatus === "completed" || childStatuses.some((status) => status === "completed")
            ? "completed"
            : "pending";

    const isGroupSelected =
      selection.nodeId === node.id && selection.logId == null && selection.logType == null;

    nodes.push({
      id: node.id,
      type: "group",
      position: { x, y },
      selected: false,
      data: {
        label: node.label,
        status: groupStatus,
        nodeType: node.type,
        baseNodeId: node.id,
        isAgentSelected: isGroupSelected,
        executions,
        expandedExecutionId,
        selectedNodeId: selection.nodeId,
        selectedLogId: selection.logId,
        selectedLogType: selection.logType,
        onSelect: onNodeSelect,
        onToggleExecution: onExecutionToggle,
        defaultSelectedLogId: null,
        defaultSelectedLogType: null,
        hasIncoming,
        hasOutgoing
      },
      style: {
        width: dagreNode?.width ?? GROUP_WIDTH_MIN,
        height: dagreNode?.height ?? NODE_HEIGHT,
        padding: 0,
        background: "var(--color-node-group-bg)",
        border:
          groupStatus === "running"
            ? "2px solid var(--color-node-running-border)"
            : `1px dashed var(--color-node-${groupStatus}-border)`,
        borderRadius: "var(--radius-sm)",
        boxShadow:
          groupStatus === "running"
            ? "0 0 0 3px color-mix(in srgb, var(--color-node-running-border) 20%, transparent)"
            : undefined
      }
    });
  }

  const edges: Edge[] = definition.edges.map((edgeDef, index) => ({
    id: `e-${edgeDef.source}-${edgeDef.target}-${index}`,
    source: edgeDef.source,
    target: edgeDef.target,
    label: edgeDef.label,
    animated: nodeStatuses[edgeDef.source] === "running",
    style: { stroke: "var(--color-neutral-400)" }
  }));

  return { nodes, edges };
}

export function usePipelineGraph(
  definition: PipelineDefinition | null,
  logs: HookLogEntry[],
  nodeStatuses: Record<string, NodeStatus>,
  selection: GraphSelection,
  onNodeSelect?: GraphSelectHandler,
  expandedExecutionIds: Record<string, string | null> = {},
  onExecutionToggle?: GraphExecutionToggleHandler
): UseGraphResult {
  return useMemo(() => {
    if (!definition) return { nodes: [], edges: [] };
    return layoutGraph(definition, logs, nodeStatuses, selection, onNodeSelect, expandedExecutionIds, onExecutionToggle);
  }, [definition, expandedExecutionIds, logs, nodeStatuses, onExecutionToggle, onNodeSelect, selection]);
}
