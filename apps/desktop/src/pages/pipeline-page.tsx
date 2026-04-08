// 책임: 메인 페이지 — 그래프 + 타임라인을 조립한다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow, ReactFlowProvider } from "@xyflow/react";
import { AppShell } from "@/components/layout/app-shell";
import { LogPanel } from "@/features/log-viewer/components/log-panel";
import { SessionSelector } from "@/features/session/components/session-selector";
import { AuthStatusBadge } from "@/features/session/components/auth-status-badge";
import { useSessions } from "@/features/session/hooks/use-sessions";
import { useAuthStatus } from "@/features/session/hooks/use-auth-status";
import { PipelineCanvas } from "@/features/pipeline-graph/components/pipeline-canvas";
import { PipelineToolbar } from "@/features/pipeline-graph/components/pipeline-toolbar";
import { usePipelineGraph } from "@/features/pipeline-graph/hooks/use-pipeline-graph";
import { useNodeStatus } from "@/features/pipeline-graph/hooks/use-node-status";
import { useLogQuery } from "@/features/log-viewer/hooks/use-log-query";
import { TimelinePanel } from "@/features/timeline/components/timeline-panel";
import { useTimelineData } from "@/features/timeline/hooks/use-timeline-data";
import type { PipelineDefinition } from "@shared/ipc";

const TIMELINE_H_DEFAULT = 200;
const TIMELINE_H_MIN = 80;
const TIMELINE_H_MAX = 520;

function PipelinePageInner() {
  const reactFlow = useReactFlow();
  const { sessions } = useSessions();
  const { activeProvider, activeStatus } = useAuthStatus();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [selectedLogType, setSelectedLogType] = useState<"agent" | "skill" | null>(null);
  const [selectedTimelineRowId, setSelectedTimelineRowId] = useState<string | null>(null);
  const [expandedExecutionIds, setExpandedExecutionIds] = useState<Record<string, string | null>>({});
  const [pipeline, setPipeline] = useState<PipelineDefinition | null>(null);
  const [pipelineName, setPipelineName] = useState("Pipeline");
  const [timelineH, setTimelineH] = useState(TIMELINE_H_DEFAULT);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const didInitRef = useRef(false);
  // 목적: 이미 인식한 세션 ID 집합을 보관해 신규 세션 추가를 감지한다.
  const knownSessionIdsRef = useRef<Set<string>>(new Set());
  // 목적: 드래그 시작 시점의 Y좌표와 높이를 저장한다.
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    dragRef.current = { startY: e.clientY, startH: timelineH };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      // 이유: 위로 드래그(startY > currentY)하면 높이가 증가한다.
      const delta = dragRef.current.startY - ev.clientY;
      setTimelineH(Math.max(TIMELINE_H_MIN, Math.min(TIMELINE_H_MAX, dragRef.current.startH + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  }, [timelineH]);

  // 목적: 마운트 시 log-watcher 시작 + 파이프라인 로드, 언마운트 시 watcher 중지.
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    // 이유: defaultCwd가 비어있으면 현재 디렉토리 기준으로 감시한다.
    window.atlas.getConfig().then((config) => {
      const cwd = config.defaultCwd || ".";
      window.atlas.startLogWatcher(cwd);
    });

    window.atlas.listPipelines().then(async (list) => {
      if (list.length > 0) {
        const def = await window.atlas.getPipeline(list[0]!.id);
        if (def) {
          setPipeline(def);
          setPipelineName(def.name);
        }
      }
    });

    return () => {
      didInitRef.current = false;
      window.atlas.stopLogWatcher();
    };
  }, []);

  // 목적: 새 세션이 생기면 자동으로 해당 세션으로 전환한다.
  // 이유: prev ?? first 패턴은 prev가 이미 설정된 경우 신규 세션을 무시하므로,
  //       knownSessionIds로 신규 세션을 감지해 명시적으로 전환한다.
  useEffect(() => {
    if (sessions.length === 0) return;

    // 초기 진입: 아직 인식한 세션이 없으면 첫 번째 세션 선택
    if (knownSessionIdsRef.current.size === 0) {
      setSessionId(sessions[0]!.sessionId);
      sessions.forEach((s) => knownSessionIdsRef.current.add(s.sessionId));
      return;
    }

    // 신규 세션 감지: 기존 집합에 없는 세션을 찾아 전환
    const newSession = sessions.find((s) => !knownSessionIdsRef.current.has(s.sessionId));
    sessions.forEach((s) => knownSessionIdsRef.current.add(s.sessionId));
    if (newSession) {
      setSessionId(newSession.sessionId);
    }
  }, [sessions]);

  useEffect(() => {
    setSelectedNodeId(null);
    setSelectedLogId(null);
    setSelectedLogType(null);
    setSelectedTimelineRowId(null);
    setExpandedExecutionIds({});
  }, [sessionId]);

  const { logs, loading } = useLogQuery(sessionId);
  const nodeStatuses = useNodeStatus(logs, pipeline);
  const timelineData = useTimelineData(logs, pipeline, nodeStatuses);
  const handleImport = useCallback(async () => {
    const def = await window.atlas.importPipeline();
    if (def) {
      setPipeline(def);
      setPipelineName(def.name);
    }
  }, []);

  const handleFitView = useCallback(() => {
    reactFlow.fitView({ padding: 0.2 });
  }, [reactFlow]);

  const handleNodeSelect = useCallback(
    (nodeId: string | null, logId?: number | null, logType?: "agent" | "skill" | null) => {
      setSelectedNodeId(nodeId);
      setSelectedLogId(logId ?? null);
      setSelectedLogType(logType ?? null);

      if (!nodeId) {
        setSelectedTimelineRowId(null);
        return;
      }

      const matchedRow =
        timelineData.rows.find(
          (row) =>
            row.nodeId === nodeId &&
            row.selectedLogId === (logId ?? undefined) &&
            row.selectedLogType === (logType ?? undefined)
        ) ??
        timelineData.rows.find((row) => row.nodeId === nodeId && row.depth === 0) ??
        null;

      setSelectedTimelineRowId(matchedRow?.rowId ?? null);
    },
    [timelineData.rows]
  );

  const handleBarClick = useCallback(
    (rowId: string, nodeId: string, logId?: number, logType?: "agent" | "skill") => {
      setSelectedTimelineRowId(rowId);
      setSelectedNodeId(nodeId);
      setSelectedLogId(logId ?? null);
      setSelectedLogType(logType ?? null);
    },
    []
  );

  const handleExecutionToggle = useCallback((nodeId: string, executionId: string | null) => {
    setExpandedExecutionIds((prev) => ({
      ...prev,
      [nodeId]: executionId
    }));
  }, []);

  const graphSelection = useMemo(() => ({
    nodeId: selectedNodeId,
    logId: selectedLogId,
    logType: selectedLogType
  }), [selectedLogId, selectedLogType, selectedNodeId]);
  const { nodes, edges } = usePipelineGraph(
    pipeline,
    logs,
    nodeStatuses,
    graphSelection,
    handleNodeSelect,
    expandedExecutionIds,
    handleExecutionToggle
  );

  return (
    <AppShell
      headerLeft={
        <SessionSelector sessions={sessions} selectedId={sessionId} onSelect={setSessionId} />
      }
      headerCenter={
        <span className="text-xs font-semibold text-[var(--color-text-strong)]">{pipelineName}</span>
      }
      headerRight={
        <AuthStatusBadge
          provider={activeProvider}
          state={activeStatus?.state ?? "checking"}
        />
      }
    >
      <PipelineToolbar onImport={handleImport} onFitView={handleFitView} />

      {/* 이유: min-h-0 없으면 flex 자식이 콘텐츠 크기로 넘칠 수 있다. */}
      <div className="min-h-0 flex-1">
        <div className="flex h-full min-h-0">
          <div className="min-w-0 flex-1">
            <PipelineCanvas
              nodes={nodes}
              edges={edges}
              onNodeSelect={handleNodeSelect}
            />
          </div>
          <LogPanel
            logs={logs}
            loading={loading}
            selectedNodeId={selectedNodeId}
            selectedLogId={selectedLogId}
            selectedLogType={selectedLogType}
            onSelectNode={handleNodeSelect}
            pipeline={pipeline}
            nodeStatuses={nodeStatuses}
          />
        </div>
      </div>

      {/* 드래그 리사이즈 핸들 — 타임라인 패널 경계 */}
      <div
        className="group relative h-1.5 shrink-0 cursor-ns-resize select-none border-t border-[var(--color-border-subtle)] transition-colors hover:border-[var(--color-brand-300)] hover:bg-[var(--color-brand-50)]"
        onMouseDown={handleResizeStart}
      >
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="inline-block h-1 w-1 rounded-full bg-[var(--color-brand-400)]" />
          <span className="inline-block h-1 w-1 rounded-full bg-[var(--color-brand-400)]" />
          <span className="inline-block h-1 w-1 rounded-full bg-[var(--color-brand-400)]" />
        </div>
      </div>

      <TimelinePanel
        data={timelineData}
        selectedRowId={selectedTimelineRowId}
        onBarClick={handleBarClick}
        height={timelineH}
        open={timelineOpen}
        onOpenChange={setTimelineOpen}
      />
    </AppShell>
  );
}

// 이유: useReactFlow 훅은 ReactFlowProvider 내부에서만 사용 가능하다.
export default function PipelinePage() {
  return (
    <ReactFlowProvider>
      <PipelinePageInner />
    </ReactFlowProvider>
  );
}
