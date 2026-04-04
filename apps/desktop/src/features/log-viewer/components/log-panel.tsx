// 책임: 선택된 노드/실행 인스턴스의 상세 정보를 Inspector로 렌더한다.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bot, Zap, X, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { LogDetailView } from "@/features/log-viewer/components/log-detail-view";
import { NodeStatusBadge } from "@/features/pipeline-graph/components/node-status-badge";
import type { HookLogEntry, PipelineDefinition, NodeStatus } from "@shared/ipc";
import {
  collectChildAgentIds,
  formatAgentExecutionLabel,
  formatSkillExecutionLabel
} from "@/lib/pipeline-execution";

const PANEL_W_DEFAULT = 360;
const PANEL_W_MIN = 300;
const PANEL_W_MAX = 760;
const PANEL_HANDLE_W = 8;

interface LogPanelProps {
  logs: HookLogEntry[];
  loading: boolean;
  selectedNodeId: string | null;
  selectedLogId: number | null;
  selectedLogType: HookLogEntry["type"] | null;
  onSelectNode?: (nodeId: string | null, logId?: number | null, logType?: HookLogEntry["type"] | null) => void;
  pipeline: PipelineDefinition | null;
  nodeStatuses: Record<string, NodeStatus>;
}

interface InspectorSectionProps {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

interface ExecutionListItem {
  id: string;
  label: string;
  status: NodeStatus;
  startedAt?: string;
  durationSec?: number;
  logId: number;
  logType: HookLogEntry["type"];
}

interface ChildExecutionItem extends ExecutionListItem {
  nodeId: string;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function fmtDur(sec: number): string {
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m${sec % 60 > 0 ? `${sec % 60}s` : ""}`;
}

function formatSkillInstanceLabel(
  node: PipelineDefinition["nodes"][number] | undefined,
  log: HookLogEntry,
  logs: HookLogEntry[],
  pipeline: PipelineDefinition | null
): string {
  const caller = log.caller;
  const parentLabel =
    caller && caller !== "orchestrator"
      ? pipeline?.nodes.find((entry) => entry.id === caller.agentType)?.label
      : undefined;

  return formatSkillExecutionLabel(parentLabel, node?.label ?? log.name, log, logs);
}

function getRelevantLogsForNode(
  nodeId: string,
  pipeline: PipelineDefinition | null,
  logs: HookLogEntry[]
): HookLogEntry[] {
  const nodeDef = pipeline?.nodes.find((n) => n.id === nodeId);
  if (!nodeDef) return [];

  if (nodeDef.type === "skill") {
    return logs.filter((entry) => entry.type === "skill" && entry.name === nodeId);
  }

  const childAgentIds = collectChildAgentIds(logs);
  const agentLogs = logs.filter((entry) => entry.type === "agent" && entry.name === nodeId);
  if (nodeDef.parentId) {
    return agentLogs;
  }

  const rootAgentLogs = agentLogs.filter((entry) => !entry.instanceKey || !childAgentIds.has(entry.instanceKey));
  return rootAgentLogs.length > 0 ? rootAgentLogs : agentLogs;
}

function InspectorSection({ title, open, onOpenChange, children }: InspectorSectionProps) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="border-b border-[var(--color-border-subtle)]">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 hover:bg-[var(--color-surface-subtle)]">
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
        )}
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          {title}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

function ExecutionListButton({
  item,
  selected,
  onClick,
  disabled = false
}: {
  item: ExecutionListItem;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left ${
        disabled
          ? "cursor-default opacity-60"
          : selected
            ? "bg-[var(--color-brand-50)]"
            : "hover:bg-[var(--color-surface-subtle)]"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-[var(--color-text-strong)]">{item.label}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] tabular-nums text-[var(--color-text-soft)]">
          {item.startedAt && <span>{fmtTime(item.startedAt)}</span>}
          {item.durationSec != null && <span>{fmtDur(item.durationSec)}</span>}
        </div>
      </div>
      <NodeStatusBadge status={item.status} />
    </button>
  );
}

interface InspectorProps {
  nodeId: string;
  selectedLogId: number | null;
  selectedLogType: HookLogEntry["type"] | null;
  logs: HookLogEntry[];
  pipeline: PipelineDefinition | null;
  nodeStatuses: Record<string, NodeStatus>;
  onClose: () => void;
  onSelectNode: (nodeId: string, logId?: number | null, logType?: HookLogEntry["type"] | null) => void;
}

function ExecutionInspector({
  nodeId,
  selectedLogId,
  selectedLogType,
  logs,
  pipeline,
  nodeStatuses,
  onClose,
  onSelectNode
}: InspectorProps) {
  const nodeDef = pipeline?.nodes.find((n) => n.id === nodeId);
  const type = nodeDef?.type ?? "agent";
  const Icon = type === "agent" ? Bot : Zap;
  const [sectionsOpen, setSectionsOpen] = useState({
    execution: false,
    executions: false,
    children: false,
    result: true
  });

  const relevantLogs = useMemo(() => getRelevantLogsForNode(nodeId, pipeline, logs), [nodeId, pipeline, logs]);
  const isExecutionSelection = selectedLogId != null && selectedLogType != null;

  useEffect(() => {
    setSectionsOpen({
      execution: false,
      executions: false,
      children: false,
      result: true
    });
  }, [nodeId]);

  const log = useMemo(() => {
    if (selectedLogType === "skill" && selectedLogId == null) {
      return null;
    }

    const selectedLog =
      isExecutionSelection
        ? (relevantLogs.find((entry) => entry.id === selectedLogId && entry.type === selectedLogType) ?? null)
        : null;

    if (selectedLog) return selectedLog;
    if (!isExecutionSelection && type === "agent") return null;

    return [...relevantLogs].sort((a, b) => (b.startTime > a.startTime ? 1 : -1))[0] ?? null;
  }, [isExecutionSelection, relevantLogs, selectedLogId, selectedLogType, type]);

  const label = useMemo(() => {
    if (type !== "skill" || !log) return nodeDef?.label ?? nodeId;
    return formatSkillInstanceLabel(nodeDef, log, logs, pipeline);
  }, [log, logs, nodeDef, nodeId, pipeline, type]);

  const status = log ? (!log.endTime ? "running" : "completed") : (nodeStatuses[nodeId] ?? "pending");

  const executionItems = useMemo<ExecutionListItem[]>(() => {
    return [...relevantLogs]
      .sort((a, b) => (b.startTime > a.startTime ? 1 : -1))
      .map((entry) => ({
        id: `${entry.type}-${entry.id}`,
        label:
          entry.type === "skill"
            ? formatSkillInstanceLabel(nodeDef, entry, logs, pipeline)
            : formatAgentExecutionLabel(nodeDef?.label ?? entry.name, entry, logs),
        status: entry.endTime ? "completed" : "running",
        startedAt: entry.startTime,
        durationSec: entry.durationSec,
        logId: entry.id,
        logType: entry.type
      }));
  }, [logs, nodeDef, pipeline, relevantLogs]);

  const activeExecutionKey = log ? `${log.type}-${log.id}` : null;

  const childItems = useMemo<ChildExecutionItem[]>(() => {
    if (!log || log.type !== "agent") {
      return [];
    }

    const childIds = pipeline?.nodes.filter((n) => n.parentId === nodeId).map((n) => n.id) ?? [];
    const selectedAgentInstanceKey = log.instanceKey ?? null;
    const items: ChildExecutionItem[] = [];

    childIds.forEach((childId) => {
      const childDef = pipeline?.nodes.find((n) => n.id === childId);
      const childLogs = logs
        .filter(
          (entry) =>
            entry.type === "skill" &&
            entry.name === childId &&
            (!selectedAgentInstanceKey ||
              (entry.caller !== undefined &&
                entry.caller !== "orchestrator" &&
                entry.caller.agentId === selectedAgentInstanceKey))
        )
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      if (childLogs.length === 0) {
        items.push({
          id: `${childId}-pending`,
          label: childDef?.label ?? childId,
          status: "pending",
          startedAt: undefined,
          durationSec: undefined,
          logId: -1,
          logType: "skill",
          nodeId: childId
        });
        return;
      }

      childLogs.forEach((entry, index) => {
        items.push({
          id: `${childId}-${entry.instanceKey ?? index + 1}`,
          label: formatSkillInstanceLabel(childDef, entry, logs, pipeline),
          status: entry.endTime ? "completed" : "running",
          startedAt: entry.startTime,
          durationSec: entry.durationSec,
          logId: entry.id,
          logType: entry.type,
          nodeId: childId
        });
      });
    });

    return items;
  }, [log, logs, nodeId, pipeline]);

  const hasMetadata = Boolean(log?.instanceKey || log?.args || log?.caller || log?.childAgentId);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between border-b border-[var(--color-border-subtle)] px-3 py-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
            <span className="truncate text-sm font-semibold text-[var(--color-text-strong)]">{label}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="py-0 text-[10px]">
              {type}
            </Badge>
            <NodeStatusBadge status={status} />
            <span className="font-mono text-[10px] text-[var(--color-text-soft)]">{nodeId}</span>
          </div>
          {nodeDef?.description && (
            <div className="text-xs leading-5 text-[var(--color-text-soft)]">{nodeDef.description}</div>
          )}
        </div>
        <div className="ml-2 flex items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text-strong)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {log && (
          <InspectorSection
            title="실행 정보"
            open={sectionsOpen.execution}
            onOpenChange={(open) => setSectionsOpen((prev) => ({ ...prev, execution: open }))}
          >
            <div className="space-y-3 px-3 py-2">
              <div className="flex flex-wrap items-center gap-3 text-[10px] tabular-nums text-[var(--color-text-muted)]">
                <span>시작 {fmtTime(log.startTime)}</span>
                {log.endTime && <span>종료 {fmtTime(log.endTime)}</span>}
                {log.durationSec != null && (
                  <span className="font-semibold text-[var(--color-text-strong)]">{fmtDur(log.durationSec)}</span>
                )}
              </div>

              {hasMetadata && (
                <div className="space-y-2">
                  {log.instanceKey && (
                    <div className="rounded-md bg-[var(--color-surface-subtle)] px-2.5 py-2 text-[11px] text-[var(--color-text-soft)]">
                      instance: <span className="font-mono text-[var(--color-text-strong)]">{log.instanceKey}</span>
                    </div>
                  )}
                  {log.caller && log.caller !== "orchestrator" && (
                    <div className="rounded-md bg-[var(--color-surface-subtle)] px-2.5 py-2 text-[11px] text-[var(--color-text-soft)]">
                      caller: <span className="font-mono text-[var(--color-text-strong)]">{log.caller.agentType}</span>{" "}
                      <span className="font-mono text-[var(--color-text-muted)]">({log.caller.agentId})</span>
                    </div>
                  )}
                  {log.childAgentId && (
                    <div className="rounded-md bg-[var(--color-surface-subtle)] px-2.5 py-2 text-[11px] text-[var(--color-text-soft)]">
                      child: <span className="font-mono text-[var(--color-text-strong)]">{log.childAgentId}</span>
                      {log.childStatus && <span> · {log.childStatus}</span>}
                    </div>
                  )}
                  {log.args && (
                    <div className="rounded-md bg-[var(--color-surface-subtle)] px-2.5 py-2 text-[11px] text-[var(--color-text-soft)]">
                      <div className="mb-1">args</div>
                      <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-[var(--color-text-strong)]">
                        {log.args}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </InspectorSection>
        )}

        {executionItems.length > 1 && (
          <InspectorSection
            title="실행 목록"
            open={sectionsOpen.executions}
            onOpenChange={(open) => setSectionsOpen((prev) => ({ ...prev, executions: open }))}
          >
            <div className="space-y-1 px-3 py-2">
              {executionItems.map((item) => (
                <ExecutionListButton
                  key={item.id}
                  item={item}
                  selected={item.id === activeExecutionKey}
                  onClick={() => onSelectNode(nodeId, item.logId, item.logType)}
                />
              ))}
            </div>
          </InspectorSection>
        )}

        {childItems.length > 0 && (
          <InspectorSection
            title="하위 스킬"
            open={sectionsOpen.children}
            onOpenChange={(open) => setSectionsOpen((prev) => ({ ...prev, children: open }))}
          >
            <div className="space-y-1 px-3 py-2">
              {childItems.map((child) => (
                <ExecutionListButton
                  key={child.id}
                  item={{
                    id: child.id,
                    label: child.label,
                    status: child.status,
                    startedAt: child.startedAt || undefined,
                    durationSec: child.durationSec,
                    logId: child.logId,
                    logType: child.logType
                  }}
                  selected={false}
                  disabled={child.logId < 0}
                  onClick={() => {
                    if (child.logId < 0) return;
                    onSelectNode(child.nodeId, child.logId, child.logType);
                  }}
                />
              ))}
            </div>
          </InspectorSection>
        )}

        <InspectorSection
          title="결과 데이터"
          open={sectionsOpen.result}
          onOpenChange={(open) => setSectionsOpen((prev) => ({ ...prev, result: open }))}
        >
          {log?.detail ? (
            <div className="px-3 py-2">
              <LogDetailView detail={log.detail} />
            </div>
          ) : !isExecutionSelection && type === "agent" ? (
            <div className="flex items-center justify-center py-6 text-xs text-[var(--color-text-soft)]">
              실행 목록에서 특정 실행을 선택하면 결과 데이터가 표시됩니다
            </div>
          ) : (
            <div className="flex items-center justify-center py-6 text-xs text-[var(--color-text-soft)]">
              {log ? "결과 데이터 없음" : "아직 실행되지 않았습니다"}
            </div>
          )}
        </InspectorSection>
      </div>
    </div>
  );
}

export function LogPanel({
  logs,
  loading,
  selectedNodeId,
  selectedLogId,
  selectedLogType,
  onSelectNode,
  pipeline,
  nodeStatuses
}: LogPanelProps) {
  const [panelWidth, setPanelWidth] = useState(PANEL_W_DEFAULT);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleResizeStart = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const startX = event.clientX;
      const startWidth = panelWidth;

      const onMove = (moveEvent: MouseEvent) => {
        const delta = startX - moveEvent.clientX;
        const nextWidth = Math.min(Math.max(startWidth + delta, PANEL_W_MIN), PANEL_W_MAX);
        setPanelWidth(nextWidth);
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      event.preventDefault();
    },
    [panelWidth]
  );

  if (isCollapsed) {
    return (
      <div className="flex h-full w-8 shrink-0 flex-col border-l border-[var(--color-border-subtle)] bg-[var(--color-surface-base)]">
        <button
          type="button"
          aria-label="인스펙터 열기"
          onClick={() => setIsCollapsed(false)}
          className="flex h-10 items-center justify-center border-b border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text-strong)]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full shrink-0 border-l border-[var(--color-border-subtle)] bg-[var(--color-surface-base)]"
      style={{ width: panelWidth }}
    >
      <button
        type="button"
        aria-label="인스펙터 너비 조절"
        className="group absolute inset-y-0 left-0 z-10 cursor-col-resize hover:bg-[var(--color-brand-50)]"
        style={{ width: PANEL_HANDLE_W }}
        onMouseDown={handleResizeStart}
      >
        <span className="pointer-events-none absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-[var(--color-neutral-300)] group-hover:bg-[var(--color-brand-400)]" />
      </button>

      <div className="flex min-w-0 flex-1 flex-col" style={{ marginLeft: PANEL_HANDLE_W }}>
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-3 py-2">
          <span className="text-xs font-semibold text-[var(--color-text-strong)]">Inspector</span>
          <button
            type="button"
            aria-label="인스펙터 접기"
            onClick={() => setIsCollapsed(true)}
            className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text-strong)]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center text-xs text-[var(--color-text-soft)]">
              로딩 중...
            </div>
          ) : selectedNodeId == null ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[var(--color-text-soft)]">
              <Bot className="h-8 w-8 opacity-30" />
              <span className="text-xs">노드를 클릭하면 상세 인스펙터가 표시됩니다</span>
              <span className="text-[10px]">그래프의 노드나 타임라인 실행 막대를 선택하세요</span>
            </div>
          ) : (
            <ExecutionInspector
              nodeId={selectedNodeId}
              selectedLogId={selectedLogId}
              selectedLogType={selectedLogType}
              logs={logs}
              pipeline={pipeline}
              nodeStatuses={nodeStatuses}
              onClose={() => onSelectNode?.(null, null, null)}
              onSelectNode={(nodeId, logId, logType) => onSelectNode?.(nodeId, logId, logType)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
