// 책임: 메인 프로세스의 FlowState를 폴링하여 파이프라인 UI에 제공한다.

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AppSettings,
  FlowInvokeRequest,
  FlowRunStatus,
  FlowState,
  PipelinePhase,
  PipelineState,
  TodoItem,
  ActivityLogEntry
} from "@shared/ipc";

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

// 목적: 재실행 시 PipelinePhase를 그래프 진입 노드명으로 변환한다.
export const PHASE_TO_START_NODE: Partial<Record<PipelinePhase, string>> = {
  dor: "dor_formal",
  plan: "build_todos"
};

const INITIAL_FLOW_STATE: FlowState = {
  flowId: null,
  flowType: null,
  status: "idle",
  startedAt: null,
  endedAt: null,
  error: null,
  nodeProgress: [],
  currentPhase: "idle",
  todos: [],
  holdReason: "",
  activityLog: []
};

const POLL_INTERVAL_MS = 500;

// ─── 헬퍼 ───────────────────────────────────────────────

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

// 목적: FlowState에서 PhaseData를 직접 파생한다 (JSON 재파싱 없음).
function flowStateToPhaseData(state: FlowState): PhaseData {
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

// ─── 훅 ─────────────────────────────────────────────────

export function useFlowState(settings: AppSettings | null) {
  const [flowState, setFlowState] = useState<FlowState>(INITIAL_FLOW_STATE);
  const [loading, setLoading] = useState(true);

  // 목적: 마운트 시 메인 프로세스에서 현재 FlowState를 가져온다.
  useEffect(() => {
    window.atlas.getFlowState().then((state) => {
      setFlowState(state);
      setLoading(false);
    });
  }, []);

  // 목적: 실행 중일 때만 폴링하여 상태를 갱신한다.
  useEffect(() => {
    if (flowState.status !== "running") return;
    const timer = setInterval(async () => {
      const state = await window.atlas.getFlowState();
      setFlowState(state);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [flowState.status]);

  // 목적: FlowState 또는 settings.pipeline에서 PhaseData를 파생한다.
  // 이유: idle 상태에서는 저장된 settings.pipeline을 사용하고, 그 외에는 FlowState에서 직접 파생한다.
  const phaseData = useMemo((): PhaseData => {
    if (flowState.status === "idle") {
      return settings?.pipeline ? pipelineStateToPhaseData(settings.pipeline) : EMPTY_PHASE_DATA;
    }
    return flowStateToPhaseData(flowState);
  }, [flowState, settings]);

  const invoke = useCallback(async (request: FlowInvokeRequest) => {
    await window.atlas.invokeFlow(request);
    // 목적: 시작 직후 상태를 즉시 가져온다.
    const state = await window.atlas.getFlowState();
    setFlowState(state);
  }, []);

  const cancel = useCallback(async () => {
    await window.atlas.cancelFlow({ flowId: flowState.flowId ?? "" });
    const state = await window.atlas.getFlowState();
    setFlowState(state);
  }, [flowState.flowId]);

  const reset = useCallback(async () => {
    await window.atlas.resetFlow();
    setFlowState(INITIAL_FLOW_STATE);
  }, []);

  return {
    flowState,
    phaseData,
    loading,
    invoke,
    cancel,
    reset
  };
}
