// 책임: Run 수준 오케스트레이션을 담당한다. 실행 시작/취소/상태 조회를 제공한다.

import { randomUUID } from "node:crypto";
import type {
  RunState,
  RunStartRequest,
  RunStartResponse,
  RunCancelRequest,
  TaskExecutionState,
  TaskApprovalRequest
} from "../../../shared/ipc";
import { getRunState, saveRunState, clearRunState } from "./run-state-store";
import { getAllTaskStates, getTaskState, clearTaskStates } from "./task-state-store";

function createInitialRunState(ticketId: string): RunState {
  return {
    runId: randomUUID(),
    ticketId,
    status: "idle",
    currentStep: "idle",
    startedAt: null,
    endedAt: null,
    error: null,
    parsedRequirements: null,
    riskAssessment: null,
    executionPlan: null
  };
}

// 목적: 새 Run을 시작한다. 이미 실행 중이면 거부한다.
export function startRun(request: RunStartRequest): RunStartResponse {
  const current = getRunState();
  if (current && current.status === "running") {
    return {
      status: "rejected",
      runId: current.runId,
      message: "이미 실행 중인 Run이 있습니다."
    };
  }

  const state = createInitialRunState(request.ticketId);
  state.status = "running";
  state.currentStep = "ingestion";
  state.startedAt = Date.now();
  saveRunState(state);

  // TODO: Phase 1에서 파이프라인 그래프 실행을 여기서 시작한다.

  return { status: "accepted", runId: state.runId };
}

// 목적: 실행 중인 Run을 취소한다.
export function cancelRun(_request: RunCancelRequest): void {
  const state = getRunState();
  if (!state || state.status !== "running") return;

  state.status = "failed";
  state.error = "사용자에 의해 취소됨";
  state.endedAt = Date.now();
  saveRunState(state);

  // TODO: Phase 2에서 진행 중인 task executor를 중단한다.
}

export function fetchRunState(): RunState | null {
  return getRunState();
}

export function resetRun(): void {
  clearRunState();
  clearTaskStates();
}

export function fetchTaskState(taskId: string): TaskExecutionState | null {
  return getTaskState(taskId);
}

export function fetchAllTaskStates(): Record<string, TaskExecutionState> {
  const state = getRunState();
  if (!state) return {};
  return getAllTaskStates(state.runId);
}

// 목적: 작업 승인/반려/재생성 결정을 처리한다.
export function handleTaskApproval(_request: TaskApprovalRequest): void {
  // TODO: Phase 3에서 approval gate 재개 로직을 구현한다.
}

// 목적: 진행 중인 task를 취소한다.
export function cancelTask(_taskId: string): void {
  // TODO: Phase 2에서 task executor 중단 로직을 구현한다.
}
