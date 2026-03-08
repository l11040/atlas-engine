// 책임: 메인 프로세스의 FlowState를 폴링하여 파이프라인 UI에 제공한다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppSettings,
  FlowInvokeRequest,
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
  // 이유: useEffect 의존성 기반 폴링은 비동기 상태 변경과 React 렌더 사이클 간 타이밍 문제가 발생할 수 있다.
  // ref 기반으로 폴링 제어를 React 렌더와 분리한다.
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 목적: 폴링을 시작한다. 이미 폴링 중이면 무시한다.
  const startPolling = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(async () => {
      try {
        const state = await window.atlas.getFlowState();
        setFlowState(state);
        // 목적: 터미널 상태에 도달하면 폴링을 자동 중지한다.
        if (state.status !== "running") {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      } catch {
        // 주의: IPC 오류 시 다음 interval에서 재시도한다. 폴링을 중단하지 않는다.
      }
    }, POLL_INTERVAL_MS);
  }, []);

  // 목적: 폴링을 중지한다.
  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 목적: 마운트 시 메인 프로세스에서 현재 FlowState를 가져오고, running이면 폴링을 시작한다.
  useEffect(() => {
    window.atlas.getFlowState().then((state) => {
      setFlowState(state);
      setLoading(false);
      if (state.status === "running") {
        startPolling();
      }
    });
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  // 목적: FlowState 또는 settings.pipeline에서 PhaseData를 파생한다.
  // 이유: idle 상태에서는 저장된 settings.pipeline을 사용하고, 그 외에는 FlowState에서 직접 파생한다.
  const phaseData = useMemo((): PhaseData => {
    if (flowState.status === "idle") {
      return settings?.pipeline ? pipelineStateToPhaseData(settings.pipeline) : EMPTY_PHASE_DATA;
    }
    return flowStateToPhaseData(flowState);
  }, [flowState, settings]);

  const invoke = useCallback(async (request: FlowInvokeRequest) => {
    try {
      await window.atlas.invokeFlow(request);
    } catch {
      // 주의: IPC 전송 자체가 실패한 경우에도 아래에서 상태를 가져온다.
    }
    // 목적: invoke 직후 상태를 즉시 가져오고, running이면 폴링을 시작한다.
    try {
      const state = await window.atlas.getFlowState();
      setFlowState(state);
      if (state.status === "running") {
        startPolling();
      }
    } catch {
      // 주의: 상태 조회 실패 시 안전하게 폴링을 시작하여 이후 복구한다.
      startPolling();
    }
  }, [startPolling]);

  const cancel = useCallback(async () => {
    stopPolling();
    try {
      await window.atlas.cancelFlow({ flowId: flowState.flowId ?? "" });
      const state = await window.atlas.getFlowState();
      setFlowState(state);
    } catch {
      // 주의: 취소 실패 시에도 현재 상태를 갱신 시도한다.
      try {
        const state = await window.atlas.getFlowState();
        setFlowState(state);
      } catch { /* 무시 */ }
    }
  }, [flowState.flowId, stopPolling]);

  const reset = useCallback(async () => {
    stopPolling();
    await window.atlas.resetFlow();
    setFlowState(INITIAL_FLOW_STATE);
  }, [stopPolling]);

  return {
    flowState,
    phaseData,
    loading,
    invoke,
    cancel,
    reset
  };
}
