// 책임: Run 수준 오케스트레이션을 담당한다. 파이프라인 그래프 → 태스크 그래프 순서로 실행한다.

import { randomUUID } from "node:crypto";
import type {
  RunState,
  RunStartRequest,
  RunStartResponse,
  RunCancelRequest,
  TaskExecutionState,
  TaskApprovalRequest,
  TaskUnit
} from "../../../shared/ipc";
import { getSettings } from "../config/settings";
import { applyTracingEnv, clearTracingEnv } from "../langchain/tracing-env";
import { buildPipelineGraph } from "../langchain/graphs/pipeline/index";
import { buildTaskGraph } from "../langchain/graphs/task/index";
import { getRunState, saveRunState, clearRunState } from "./run-state-store";
import { getAllTaskStates, getTaskState, saveTaskState, clearTaskStates } from "./task-state-store";

// 목적: 현재 실행 중인 Run의 AbortController를 관리한다.
let activeAbort: AbortController | null = null;

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

// 목적: RunState의 특정 필드를 갱신하고 저장한다.
function updateRun(patch: Partial<RunState>): void {
  const state = getRunState();
  if (!state) return;
  Object.assign(state, patch);
  saveRunState(state);
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

  // 이유: fire-and-forget — 백그라운드에서 실행하고 즉시 응답을 반환한다.
  executeRunAsync(state.runId).catch((err) => {
    console.error("[automation] run execution failed", err);
  });

  return { status: "accepted", runId: state.runId };
}

// 목적: 실행 중인 Run을 취소한다.
export function cancelRun(_request: RunCancelRequest): void {
  const state = getRunState();
  if (!state || state.status !== "running") return;

  if (activeAbort) {
    activeAbort.abort();
    activeAbort = null;
  }

  state.status = "failed";
  state.error = "사용자에 의해 취소됨";
  state.endedAt = Date.now();
  saveRunState(state);
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
  // TODO: human-in-the-loop approval gate 재개 로직
}

// 목적: 진행 중인 task를 취소한다.
export function cancelTask(_taskId: string): void {
  if (activeAbort) {
    activeAbort.abort();
    activeAbort = null;
  }
}

// ──────────────────────────────────────────────
// 비동기 실행 로직
// ──────────────────────────────────────────────

// 목적: 파이프라인 그래프 → 태스크 그래프 순서로 전체 Run을 실행한다.
async function executeRunAsync(runId: string): Promise<void> {
  const settings = getSettings();
  activeAbort = new AbortController();

  try {
    applyTracingEnv(settings.tracing);

    // ── 1단계: 파이프라인 그래프 실행 (수집 → 해석 → 위험 → 계획) ──
    await executePipelinePhase();

    const runAfterPipeline = getRunState();
    if (!runAfterPipeline || runAfterPipeline.status !== "running") return;
    if (!runAfterPipeline.executionPlan) {
      updateRun({ status: "failed", error: "실행 계획 생성 실패", endedAt: Date.now() });
      return;
    }

    // ── 2단계: 태스크 그래프 실행 (execution_order에 따라 순차 실행) ──
    updateRun({ currentStep: "execution" });
    await executeTasksPhase(
      runId,
      runAfterPipeline.executionPlan.tasks,
      runAfterPipeline.executionPlan.execution_order
    );

    const runAfterTasks = getRunState();
    if (!runAfterTasks || runAfterTasks.status !== "running") return;

    // ── 3단계: 아카이빙 ──
    updateRun({ currentStep: "archiving" });

    // ── 완료 ──
    updateRun({ currentStep: "done", status: "completed", endedAt: Date.now() });
  } catch (err) {
    // 이유: abort 시그널에 의한 종료는 이미 cancelRun에서 처리되었으므로 무시한다.
    if (activeAbort?.signal.aborted) return;
    const msg = err instanceof Error ? err.message : String(err);
    updateRun({ status: "failed", error: msg, endedAt: Date.now() });
  } finally {
    clearTracingEnv();
    activeAbort = null;
  }
}

// 목적: 파이프라인 그래프를 스트림으로 실행하고, 각 노드 완료 시 RunState를 갱신한다.
async function executePipelinePhase(): Promise<void> {
  const state = getRunState();
  if (!state) return;

  const pipeline = buildPipelineGraph();

  const nodeToStep: Record<string, RunState["currentStep"]> = {
    ingest: "ingestion",
    analyze: "analyze",
    assess_risk: "risk",
    plan: "plan"
  };

  const stream = await pipeline.stream(
    { ticketId: state.ticketId, description: "" },
    { signal: activeAbort?.signal, streamMode: "updates" }
  );

  for await (const update of stream) {
    for (const [nodeName, nodeOutput] of Object.entries(update)) {
      const step = nodeToStep[nodeName];
      if (step) updateRun({ currentStep: step });

      const output = nodeOutput as Record<string, unknown>;
      if (output.parsedRequirements !== undefined) {
        updateRun({ parsedRequirements: output.parsedRequirements as RunState["parsedRequirements"] });
      }
      if (output.riskAssessment !== undefined) {
        updateRun({ riskAssessment: output.riskAssessment as RunState["riskAssessment"] });
      }
      if (output.executionPlan !== undefined) {
        updateRun({ executionPlan: output.executionPlan as RunState["executionPlan"] });
      }
      if (output.error) {
        updateRun({ status: "failed", error: output.error as string, endedAt: Date.now() });
        return;
      }
    }
  }
}

// 목적: execution_order에 따라 태스크 그래프를 순차 실행한다.
async function executeTasksPhase(
  runId: string,
  tasks: TaskUnit[],
  executionOrder: string[]
): Promise<void> {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  for (const taskId of executionOrder) {
    const run = getRunState();
    if (!run || run.status !== "running") break;

    const task = taskMap.get(taskId);
    if (!task) continue;

    const taskState: TaskExecutionState = {
      taskId: task.id,
      status: "running",
      currentStep: "generate_changes",
      attempt: { current: 0, max: 3 },
      changeSets: null,
      explanation: null,
      verification: null,
      approval: null,
      error: null,
      startedAt: Date.now(),
      endedAt: null
    };
    saveTaskState(runId, taskState);

    try {
      const taskGraph = buildTaskGraph();

      const nodeToStep: Record<string, TaskExecutionState["currentStep"]> = {
        generate: "generate_changes",
        explain: "explain_changes",
        verify: "self_verify",
        evaluate: "self_verify",
        revise: "revise",
        approval_gate: "approval_gate",
        apply: "apply_changes",
        post_verify: "post_verify"
      };

      const stream = await taskGraph.stream(
        { task },
        { signal: activeAbort?.signal, streamMode: "updates" }
      );

      for await (const update of stream) {
        for (const [nodeName, nodeOutput] of Object.entries(update)) {
          const step = nodeToStep[nodeName];
          if (step) taskState.currentStep = step;

          const output = nodeOutput as Record<string, unknown>;
          if (output.changeSets !== undefined) taskState.changeSets = output.changeSets as TaskExecutionState["changeSets"];
          if (output.explanation !== undefined) taskState.explanation = output.explanation as TaskExecutionState["explanation"];
          if (output.verification !== undefined) taskState.verification = output.verification as TaskExecutionState["verification"];
          if (output.approval !== undefined) taskState.approval = output.approval as TaskExecutionState["approval"];
          if (output.attempt !== undefined) taskState.attempt = output.attempt as TaskExecutionState["attempt"];
          if (output.error !== undefined) taskState.error = output.error as string | null;

          saveTaskState(runId, taskState);
        }
      }

      // 목적: 태스크 최종 상태를 결정한다.
      if (taskState.error) {
        taskState.status = "failed";
      } else if (taskState.approval?.decision === "rejected") {
        taskState.status = "rejected";
      } else {
        taskState.status = "completed";
        taskState.currentStep = "done";
      }
      taskState.endedAt = Date.now();
      saveTaskState(runId, taskState);
    } catch (err) {
      if (activeAbort?.signal.aborted) break;
      taskState.status = "failed";
      taskState.error = err instanceof Error ? err.message : String(err);
      taskState.endedAt = Date.now();
      saveTaskState(runId, taskState);
      // 이유: 개별 태스크 실패가 전체 Run을 중단하지 않도록 계속 진행한다.
    }
  }
}
