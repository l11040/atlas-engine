// 책임: 파이프라인 실행 오케스트레이션 — 실시간 스트리밍 데이터 수집, 저장 상태 병합, phase 매핑을 관리한다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppSettings, PipelinePhase, PipelineState, TodoItem, ActivityLogEntry } from "@shared/ipc";
import type { FlowStatus, FlowNodeState } from "./use-langchain-flow";

// ─── PhaseData ──────────────────────────────────────────

export interface PhaseData {
  dorFormalResult: "pass" | "hold" | null;
  dorFormalReason: string;
  dorSemanticResult: "proceed" | "hold" | null;
  dorSemanticReason: string;
  todos: TodoItem[];
  holdReason: string;
  activityLog: ActivityLogEntry[];
}

const EMPTY_PHASE_DATA: PhaseData = {
  dorFormalResult: null,
  dorFormalReason: "",
  dorSemanticResult: null,
  dorSemanticReason: "",
  todos: [],
  holdReason: "",
  activityLog: []
};

// ─── 헬퍼 ───────────────────────────────────────────────

function mergeActivityLog(prev: ActivityLogEntry[], next: ActivityLogEntry[]): ActivityLogEntry[] {
  if (next.length === 0) return prev;
  const seen = new Set(prev.map((e) => `${e.timestamp}|${e.type}|${e.message}`));
  const appended = next.filter((e) => {
    const key = `${e.timestamp}|${e.type}|${e.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return appended.length > 0 ? [...prev, ...appended] : prev;
}

// 목적: 저장된 PipelineState를 PhaseData로 변환한다.
function pipelineStateToPhaseData(state: PipelineState): PhaseData {
  return {
    dorFormalResult: state.dorFormalResult ?? null,
    dorFormalReason: state.dorFormalReason ?? "",
    dorSemanticResult: state.dorSemanticResult ?? null,
    dorSemanticReason: state.dorSemanticReason ?? "",
    todos: state.todos ?? [],
    holdReason: state.holdReason ?? "",
    activityLog: state.activityLog ?? []
  };
}

// ─── 노드↔phase 매핑 ───────────────────────────────────

export const NODE_PHASE_MAP: Record<string, PipelinePhase> = {
  dor_formal: "dor",
  dor_semantic: "dor",
  build_todos: "plan",
  finalize: "plan",
  hold_end: "hold"
};

// 목적: 재실행 시 PipelinePhase를 그래프 진입 노드명으로 변환한다.
export const PHASE_TO_START_NODE: Partial<Record<PipelinePhase, string>> = {
  dor: "dor_formal",
  plan: "build_todos"
};

// ─── 훅 ─────────────────────────────────────────────────

interface UsePipelineOrchestrationArgs {
  settings: AppSettings | null;
  setSettings: (s: AppSettings) => void;
  status: FlowStatus;
  nodes: FlowNodeState[];
  result: string | null;
}

export function usePipelineOrchestration({
  settings,
  setSettings,
  status,
  nodes,
  result
}: UsePipelineOrchestrationArgs) {
  // 목적: 재실행 시 시작 phase를 추적하여 저장된 상태와 실시간 데이터를 병합한다.
  const [rerunFromPhase, setRerunFromPhase] = useState<PipelinePhase | null>(null);
  const [liveActivityLog, setLiveActivityLog] = useState<ActivityLogEntry[]>([]);
  const processedNodeIdsRef = useRef<Set<string>>(new Set());
  const processedResultRef = useRef<string | null>(null);

  // 목적: 리런 시작 시 라이브 데이터를 초기화한다.
  useEffect(() => {
    if (status === "running" && nodes.length === 0) {
      processedNodeIdsRef.current = new Set();
      processedResultRef.current = null;
      setLiveActivityLog([]);
    }
  }, [status, nodes.length]);

  // 목적: 노드 출력에서 activityLog 항목을 파싱하여 누적한다.
  useEffect(() => {
    const entriesToAppend: ActivityLogEntry[] = [];
    for (const node of nodes) {
      if (!node.output) continue;
      if (processedNodeIdsRef.current.has(node.nodeId)) continue;
      processedNodeIdsRef.current.add(node.nodeId);
      try {
        const parsed = JSON.parse(node.output);
        if (parsed.activityLog?.length) {
          entriesToAppend.push(...parsed.activityLog);
        }
      } catch {
        /* 무시 */
      }
    }
    if (entriesToAppend.length > 0) {
      setLiveActivityLog((prev) => mergeActivityLog(prev, entriesToAppend));
    }
  }, [nodes]);

  // 목적: 최종 result에서 activityLog 항목을 파싱하여 누적한다.
  useEffect(() => {
    if (!result || processedResultRef.current === result) return;
    processedResultRef.current = result;
    try {
      const parsed = JSON.parse(result);
      if (parsed.activityLog?.length) {
        setLiveActivityLog((prev) => mergeActivityLog(prev, parsed.activityLog));
      }
    } catch {
      /* 무시 */
    }
  }, [result]);

  // 목적: 스트리밍 중 노드 출력을 실시간 누적한다.
  const livePhaseData = useMemo((): PhaseData => {
    const data: PhaseData = { ...EMPTY_PHASE_DATA, activityLog: liveActivityLog };

    for (const node of nodes) {
      if (!node.output) continue;
      try {
        const parsed = JSON.parse(node.output);
        if (parsed.dorFormalResult) data.dorFormalResult = parsed.dorFormalResult;
        if (parsed.dorFormalReason) data.dorFormalReason = parsed.dorFormalReason;
        if (parsed.dorSemanticResult) data.dorSemanticResult = parsed.dorSemanticResult;
        if (parsed.dorSemanticReason) data.dorSemanticReason = parsed.dorSemanticReason;
        if (parsed.todos?.length) data.todos = parsed.todos;
        if (parsed.holdReason) data.holdReason = parsed.holdReason;
      } catch {
        /* 무시 */
      }
    }

    if (result) {
      try {
        const final = JSON.parse(result);
        if (final.todos?.length) data.todos = final.todos;
        if (final.holdReason) data.holdReason = final.holdReason;
      } catch {
        /* 무시 */
      }
    }

    return data;
  }, [nodes, result, liveActivityLog]);

  // 목적: 저장된 상태 또는 실시간 데이터 중 활성 데이터를 결정한다.
  // 이유: 재실행 시 스킵된 이전 단계의 저장된 결과를 유지하면서 실시간 데이터를 병합한다.
  const phaseData = useMemo((): PhaseData => {
    if (status !== "idle") {
      if (rerunFromPhase && settings?.pipeline) {
        const saved = pipelineStateToPhaseData(settings.pipeline);
        return {
          dorFormalResult: livePhaseData.dorFormalResult ?? saved.dorFormalResult,
          dorFormalReason: livePhaseData.dorFormalReason || saved.dorFormalReason,
          dorSemanticResult: livePhaseData.dorSemanticResult ?? saved.dorSemanticResult,
          dorSemanticReason: livePhaseData.dorSemanticReason || saved.dorSemanticReason,
          todos: livePhaseData.todos.length > 0 ? livePhaseData.todos : saved.todos,
          holdReason: livePhaseData.holdReason || saved.holdReason,
          activityLog: [...saved.activityLog, ...livePhaseData.activityLog]
        };
      }
      return livePhaseData;
    }
    if (settings?.pipeline) return pipelineStateToPhaseData(settings.pipeline);
    return EMPTY_PHASE_DATA;
  }, [status, livePhaseData, settings, rerunFromPhase]);

  // 목적: flow 진행 상태를 PipelinePhase로 매핑한다.
  // 이유: graph.stream(updates)가 노드 완료 시에만 이벤트를 발행하므로,
  //       노드 이벤트가 아닌 실시간 데이터(livePhaseData) 기반으로 phase를 결정한다.
  const currentPhase = useMemo((): PipelinePhase => {
    if (status === "idle") {
      return settings?.pipeline?.currentPhase ?? "idle";
    }
    if (status === "error") return "hold";

    if (status === "completed") {
      if (result) {
        try {
          const final = JSON.parse(result);
          return final.phase ?? "plan";
        } catch {
          return "plan";
        }
      }
      return "plan";
    }

    // status === "running": 수집된 데이터 기반으로 가장 앞선 phase를 결정한다.
    if (livePhaseData.holdReason) return "hold";
    if (livePhaseData.todos.length > 0) return "plan";
    if (livePhaseData.dorSemanticResult) return "plan";
    if (livePhaseData.dorFormalResult) return "dor";
    return rerunFromPhase ?? "intake";
  }, [status, livePhaseData, result, settings, rerunFromPhase]);

  const holdAtPhase = useMemo((): PipelinePhase | undefined => {
    if (currentPhase !== "hold") return undefined;
    if (status === "idle" && settings?.pipeline?.holdAtPhase) {
      return settings.pipeline.holdAtPhase;
    }
    const beforeHold = nodes.filter((n) => n.nodeName !== "hold_end" && n.nodeName !== "finalize");
    const lastBefore = beforeHold[beforeHold.length - 1];
    if (lastBefore) return NODE_PHASE_MAP[lastBefore.nodeName] ?? "dor";
    return "dor";
  }, [currentPhase, nodes, status, settings]);

  // 목적: flow 완료/hold 시 결과를 설정에 저장한다.
  const savePipelineState = useCallback(async (data: PhaseData, phase: PipelinePhase, holdAt?: PipelinePhase) => {
    const pipelineState: PipelineState = {
      currentPhase: phase,
      holdAtPhase: holdAt,
      dorFormalResult: data.dorFormalResult ?? undefined,
      dorFormalReason: data.dorFormalReason || undefined,
      dorSemanticResult: data.dorSemanticResult ?? undefined,
      dorSemanticReason: data.dorSemanticReason || undefined,
      todos: data.todos,
      holdReason: data.holdReason || undefined,
      activityLog: data.activityLog
    };
    const updated = await window.atlas.updateConfig({ settings: { pipeline: pipelineState } });
    setSettings(updated);
  }, [setSettings]);

  // 목적: flow가 완료되면 결과를 자동 저장한다.
  useEffect(() => {
    if (status === "completed" || (status === "error" && nodes.length > 0)) {
      savePipelineState(livePhaseData, currentPhase, holdAtPhase);
    }
  }, [status]);

  return {
    phaseData,
    currentPhase,
    holdAtPhase,
    rerunFromPhase,
    setRerunFromPhase
  };
}
