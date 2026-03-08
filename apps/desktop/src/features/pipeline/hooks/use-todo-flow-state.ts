// 책임: Todo별 독립 실행 플로우 상태를 IPC 폴링 기반으로 관리한다.
// 이유: BackendFlowService에서 실제 LangGraph 그래프를 실행하므로, 렌더러는 폴링으로 상태를 동기화한다.

import { useCallback, useEffect, useRef, useState } from "react";
import type { TodoItem, TodoFlowPhase, TodoFlowState, TodoFlowStatus } from "@shared/ipc";

export const FLOW_PHASES: TodoFlowPhase[] = ["workorder", "explore", "execute", "verify", "dod"];

// 목적: 폴링 간격 (ms).
const POLL_INTERVAL_MS = 500;

function createInitialFlowState(todoId: string): TodoFlowState {
  return {
    todoId,
    status: "idle",
    currentPhase: null,
    steps: FLOW_PHASES.map((phase) => ({
      phase,
      status: "idle" as TodoFlowStatus,
      startedAt: null,
      endedAt: null,
      result: null,
      error: null
    }))
  };
}

export interface UseTodoFlowStateReturn {
  getFlowState: (todoId: string) => TodoFlowState;
  /** 단일 Todo 플로우 실행 (백엔드 LangGraph 그래프 실행) */
  startFlow: (todoId: string, startFromNode?: string) => void;
  resetFlow: (todoId: string) => void;
  /** 전체 Todo를 실행 계획(wave)에 따라 순차 실행 (백엔드에 위임) */
  executeAll: () => void;
  /** 전체 실행 진행 중 여부 */
  isExecutingAll: boolean;
}

export function useTodoFlowState(todos: TodoItem[]): UseTodoFlowStateReturn {
  const [flowStates, setFlowStates] = useState<Map<string, TodoFlowState>>(
    () => new Map(todos.map((t) => [t.id, createInitialFlowState(t.id)]))
  );
  const [isExecutingAll, setIsExecutingAll] = useState(false);
  // 목적: 폴링이 필요한지 여부를 추적한다. running 상태이거나 executeAll 진행 중일 때 폴링한다.
  const shouldPollRef = useRef(false);

  const getFlowState = useCallback(
    (todoId: string) => flowStates.get(todoId) ?? createInitialFlowState(todoId),
    [flowStates]
  );

  // 목적: 백엔드에서 모든 Todo 상태를 일괄 조회하여 반영한다.
  // isInitial=true이면 shouldPollRef 체크를 건너뛴다 (마운트 시 초기 복원용).
  const syncFromBackend = useCallback(async (isInitial = false) => {
    if (!isInitial && !shouldPollRef.current) return;

    try {
      const allStates = await window.atlas.getAllTodoFlowStates();
      if (!allStates || Object.keys(allStates).length === 0) return;

      let anyRunning = false;

      setFlowStates((prev) => {
        const next = new Map(prev);
        for (const [todoId, backendState] of Object.entries(allStates)) {
          const flowState: TodoFlowState = {
            todoId: backendState.todoId,
            status: backendState.status,
            currentPhase: backendState.currentPhase,
            steps: backendState.steps
          };
          next.set(todoId, flowState);

          if (backendState.status === "running") {
            anyRunning = true;
          }
        }
        return next;
      });

      // 목적: running 상태 todo가 있으면 폴링을 자동 시작한다.
      if (anyRunning) {
        shouldPollRef.current = true;
        setIsExecutingAll(true);
      } else if (!isInitial) {
        shouldPollRef.current = false;
        setIsExecutingAll(false);
      }
    } catch {
      // 이유: 조회 실패는 무시하고 다음 주기에 재시도한다.
    }
  }, []);

  // 목적: 마운트 시 백엔드에서 기존 상태를 복원한다. running 상태가 있으면 폴링도 자동 시작한다.
  useEffect(() => {
    syncFromBackend(true);
  }, [syncFromBackend]);

  // 목적: 폴링 인터벌을 설정한다.
  useEffect(() => {
    const interval = setInterval(() => syncFromBackend(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [syncFromBackend]);

  // 목적: 백엔드에 단일 Todo 실행을 요청하고 폴링을 시작한다.
  const startFlow = useCallback(async (todoId: string, startFromNode?: string) => {
    // 목적: UI에서 즉시 running 상태로 전환한다.
    setFlowStates((prev) => {
      const next = new Map(prev);
      const state = next.get(todoId) ?? createInitialFlowState(todoId);
      const updated: TodoFlowState = {
        ...state,
        status: "running",
        currentPhase: "workorder",
        steps: state.steps.map((s, i) =>
          i === 0 ? { ...s, status: "running" as TodoFlowStatus, startedAt: Date.now() } : s
        )
      };
      next.set(todoId, updated);
      return next;
    });

    shouldPollRef.current = true;

    try {
      await window.atlas.startTodoFlow({
        todoId,
        provider: "claude",
        startFromNode
      });
    } catch {
      // 이유: IPC 요청 실패 시 에러 상태로 전환한다.
      setFlowStates((prev) => {
        const next = new Map(prev);
        const state = next.get(todoId) ?? createInitialFlowState(todoId);
        next.set(todoId, { ...state, status: "error" });
        return next;
      });
    }
  }, []);

  const resetFlow = useCallback((todoId: string) => {
    setFlowStates((prev) => {
      const next = new Map(prev);
      next.set(todoId, createInitialFlowState(todoId));
      return next;
    });
  }, []);

  // 목적: 백엔드에 전체 실행을 요청한다 (wave 오케스트레이션은 백엔드에서 처리).
  const executeAll = useCallback(async () => {
    if (isExecutingAll) return;
    setIsExecutingAll(true);
    shouldPollRef.current = true;

    try {
      await window.atlas.executeAllTodoFlows({ provider: "claude" });
    } catch {
      setIsExecutingAll(false);
      shouldPollRef.current = false;
    }
  }, [isExecutingAll]);

  return { getFlowState, startFlow, resetFlow, executeAll, isExecutingAll };
}
