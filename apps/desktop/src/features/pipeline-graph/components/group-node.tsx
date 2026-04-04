// 책임: agent 그룹 노드(children 포함)를 렌더한다.
import { ChevronDown, ChevronRight, Clock3, Zap } from "lucide-react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NodeStatus } from "@shared/ipc";
import { NodeStatusBadge } from "./node-status-badge";

interface GroupNodeSkillItem {
  id: string;
  baseNodeId: string;
  label: string;
  status: NodeStatus;
  logId?: number;
}

interface GroupNodeExecution {
  id: string;
  label: string;
  status: NodeStatus;
  agentLogId?: number;
  metaLabel?: string;
  durationLabel?: string;
  items: GroupNodeSkillItem[];
}

interface GroupNodeData {
  label: string;
  baseNodeId: string;
  status?: NodeStatus;
  isAgentSelected?: boolean;
  hasIncoming?: boolean;
  hasOutgoing?: boolean;
  executions?: GroupNodeExecution[];
  expandedExecutionId?: string | null;
  selectedNodeId?: string | null;
  selectedLogId?: number | null;
  selectedLogType?: "agent" | "skill" | null;
  onSelect?: (nodeId: string | null, selectedLogId?: number | null, selectedLogType?: "agent" | "skill" | null) => void;
  onToggleExecution?: (nodeId: string, executionId: string | null) => void;
  [key: string]: unknown;
}

function getExecutionRowBackground(status: NodeStatus, active: boolean): string {
  return active
    ? `color-mix(in srgb, var(--color-node-${status}-bg) 84%, var(--color-surface-base))`
    : "color-mix(in srgb, var(--color-surface-base) 90%, var(--color-brand-50))";
}

function getSkillRowBackground(status: NodeStatus, active: boolean): string {
  return active
    ? `color-mix(in srgb, var(--color-node-${status}-bg) 86%, var(--color-surface-base))`
    : "var(--color-surface-base)";
}

export function GroupNode({ data }: NodeProps) {
  const {
    label,
    baseNodeId,
    status = "pending",
    isAgentSelected = false,
    hasIncoming = true,
    hasOutgoing = true,
    executions = [],
    expandedExecutionId = null,
    selectedNodeId = null,
    selectedLogId = null,
    selectedLogType = null,
    onSelect,
    onToggleExecution
  } = data as unknown as GroupNodeData;

  const selectedTextColor = `var(--color-node-${status}-border)`;
  const selectedBackground = `color-mix(in srgb, var(--color-node-${status}-bg) 72%, transparent)`;
  const runCount = executions.filter((execution) => execution.agentLogId != null).length;

  return (
    <div
      className="h-full w-full overflow-hidden rounded-[var(--radius-sm)]"
      style={{ background: isAgentSelected ? selectedBackground : undefined }}
    >
      {hasIncoming && (
        <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-none !bg-neutral-400" />
      )}
      <div className="flex h-full flex-col px-[18px] py-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-sm font-semibold text-text-strong"
              style={{ color: isAgentSelected ? selectedTextColor : undefined }}
            >
              {label}
            </div>
            <div className="mt-1 text-2xs font-medium text-text-muted">
              {runCount > 0 ? `${runCount} runs` : "대기 중"}
            </div>
          </div>
          <NodeStatusBadge status={status} />
        </div>

        {executions.length > 0 && (
          <div className="mt-3 flex flex-1 flex-col gap-2">
            {executions.map((execution) => {
              const canSelectExecution = execution.agentLogId != null;
              const isExecutionSelected =
                selectedNodeId === baseNodeId &&
                selectedLogType === "agent" &&
                ((execution.agentLogId != null && execution.agentLogId === selectedLogId) ||
                  (execution.agentLogId == null && selectedLogId == null));
              const isExpanded = execution.id === expandedExecutionId;

              return (
                <div
                  key={execution.id}
                  className="overflow-hidden rounded-[var(--radius-xs)] border"
                  style={{
                    background: getExecutionRowBackground(execution.status, isExecutionSelected),
                    borderColor: `var(--color-node-${execution.status}-border)`,
                    boxShadow:
                      execution.status === "running"
                        ? "0 0 0 2px color-mix(in srgb, var(--color-node-running-border) 16%, transparent)"
                        : undefined
                  }}
                >
                  {canSelectExecution ? (
                    <button
                      type="button"
                      data-node-interactive="true"
                      className="nodrag nopan nowheel flex h-9 w-full items-center gap-2 px-3 text-left"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onToggleExecution?.(baseNodeId, isExpanded ? null : execution.id);
                        onSelect?.(baseNodeId, execution.agentLogId ?? null, "agent");
                      }}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                      )}
                      <span className="min-w-0 shrink-0 text-xs font-semibold text-text-strong">{execution.label}</span>
                      {execution.metaLabel && (
                        <span className="min-w-0 truncate text-2xs font-medium text-text-muted">{execution.metaLabel}</span>
                      )}
                      <div className="ml-auto flex shrink-0 items-center gap-2">
                        {execution.durationLabel && (
                          <span className="inline-flex items-center gap-1 text-2xs font-medium text-text-muted">
                            <Clock3 className="h-3 w-3" />
                            {execution.durationLabel}
                          </span>
                        )}
                        <NodeStatusBadge status={execution.status} />
                      </div>
                    </button>
                  ) : (
                    <div
                      data-node-interactive="true"
                      className="flex h-9 w-full items-center gap-2 px-3 text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                      )}
                      <span className="min-w-0 shrink-0 text-xs font-semibold text-text-soft">{execution.label}</span>
                      {execution.metaLabel && (
                        <span className="min-w-0 truncate text-2xs font-medium text-text-soft">{execution.metaLabel}</span>
                      )}
                      <div className="ml-auto flex shrink-0 items-center gap-2">
                        {execution.durationLabel && (
                          <span className="inline-flex items-center gap-1 text-2xs font-medium text-text-soft">
                            <Clock3 className="h-3 w-3" />
                            {execution.durationLabel}
                          </span>
                        )}
                        <NodeStatusBadge status={execution.status} />
                      </div>
                    </div>
                  )}

                  {isExpanded && execution.items.length > 0 && (
                    <div className="border-t border-[var(--color-border-subtle)] px-2 py-[10px]">
                      <div className="flex flex-col gap-1">
                        {execution.items.map((item) => {
                          const canSelectSkill = item.logId != null;
                          const isSkillSelected =
                            selectedNodeId === item.baseNodeId &&
                            selectedLogType === "skill" &&
                            ((item.logId != null && selectedLogId === item.logId) ||
                              (item.logId == null && selectedLogId == null));

                          return (
                            canSelectSkill ? (
                              <button
                                key={item.id}
                                type="button"
                                data-node-interactive="true"
                                className="nodrag nopan nowheel flex h-[34px] w-full items-center gap-2 rounded-[10px] border px-3 text-left"
                                style={{
                                  background: getSkillRowBackground(item.status, isSkillSelected),
                                  borderColor: `var(--color-node-${item.status}-border)`
                                }}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  onSelect?.(item.baseNodeId, item.logId, "skill");
                                }}
                              >
                                <Zap className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                                <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-strong">
                                  {item.label}
                                </span>
                                <NodeStatusBadge status={item.status} />
                              </button>
                            ) : (
                              <div
                                key={item.id}
                                data-node-interactive="true"
                                className="flex h-[34px] w-full items-center gap-2 rounded-[10px] border px-3 text-left"
                                style={{
                                  background: getSkillRowBackground(item.status, false),
                                  borderColor: `var(--color-node-${item.status}-border)`
                                }}
                              >
                                <Zap className="h-3.5 w-3.5 shrink-0 text-text-soft" />
                                <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-soft">
                                  {item.label}
                                </span>
                                <NodeStatusBadge status={item.status} />
                              </div>
                            )
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {hasOutgoing && (
        <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-none !bg-neutral-400" />
      )}
    </div>
  );
}
