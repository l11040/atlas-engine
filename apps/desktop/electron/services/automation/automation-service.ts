// 책임: Run 수준 오케스트레이션을 담당한다. 파이프라인 그래프 → 태스크 그래프 순서로 실행한다.

import { randomUUID } from "node:crypto";
import type {
  RunState,
  RunLogEntry,
  RunStartRequest,
  RunStartResponse,
  RunCancelRequest,
  TaskLogEntry,
  TaskExecutionState,
  TaskApprovalRequest,
  TaskUnit,
  ParsedRequirements
} from "../../../shared/ipc";
import { getSettings } from "../config/settings";
import { applyTracingEnv, clearTracingEnv } from "../langchain/tracing-env";
import { buildPipelineGraph } from "../langchain/graphs/pipeline/index";
import { buildTaskGraph } from "../langchain/graphs/task/index";
import { getRunState, saveRunState, clearRunState } from "./run-state-store";
import { getAllTaskStates, getTaskState, saveTaskState, clearTaskStates } from "./task-state-store";

// 목적: 현재 실행 중인 Run의 AbortController를 관리한다.
let activeAbort: AbortController | null = null;
const MAX_RUN_LOGS = 300;
const MAX_TASK_LOGS = 500;

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
    executionPlan: null,
    logs: [],
    toolTimeline: []
  };
}

function appendRunLog(entry: Omit<RunLogEntry, "timestamp"> & { timestamp?: number }): void {
  const state = getRunState();
  if (!state) return;
  const log: RunLogEntry = {
    ...entry,
    timestamp: entry.timestamp ?? Date.now()
  };
  state.logs = [...(state.logs ?? []), log].slice(-MAX_RUN_LOGS);
  saveRunState(state);
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
  appendRunLog({
    level: "info",
    step: "system",
    node: "start",
    message: `티켓 ${request.ticketId}에 대한 Run 시작`
  });

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
  appendRunLog({
    level: "error",
    step: "system",
    node: "cancel",
    message: "사용자에 의해 Run이 취소되었습니다"
  });
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
    appendRunLog({
      level: "info",
      step: "system",
      node: "execute",
      message: `Run 실행 루프 시작 (${runId})`
    });

    // ── 1단계: 파이프라인 그래프 실행 (수집 → 해석 → 위험 → 계획) ──
    await executePipelinePhase();

    const runAfterPipeline = getRunState();
    if (!runAfterPipeline || runAfterPipeline.status !== "running") return;
    if (!runAfterPipeline.executionPlan) {
      updateRun({ status: "failed", error: "실행 계획 생성 실패", endedAt: Date.now() });
      appendRunLog({
        level: "error",
        step: "plan",
        node: "plan",
        message: "파이프라인이 실행 계획 없이 완료되었습니다"
      });
      return;
    }

    // ── 2단계: 태스크 그래프 실행 (execution_order에 따라 순차 실행) ──
    updateRun({ currentStep: "execution" });
    appendRunLog({
      level: "info",
      step: "execution",
      node: "tasks",
      message: `${runAfterPipeline.executionPlan.execution_order.length}개 작업 실행 시작`
    });
    await executeTasksPhase(
      runId,
      runAfterPipeline.executionPlan.tasks,
      runAfterPipeline.executionPlan.execution_order,
      runAfterPipeline.parsedRequirements
    );

    const runAfterTasks = getRunState();
    if (!runAfterTasks || runAfterTasks.status !== "running") return;

    // ── 3단계: 아카이빙 ──
    updateRun({ currentStep: "archiving" });
    appendRunLog({
      level: "info",
      step: "archiving",
      node: "archive",
      message: "실행 결과 저장 중"
    });

    // ── 완료 ──
    updateRun({ currentStep: "done", status: "completed", endedAt: Date.now() });
    appendRunLog({
      level: "info",
      step: "done",
      node: "complete",
      message: "Run이 성공적으로 완료되었습니다"
    });
  } catch (err) {
    // 이유: abort 시그널에 의한 종료는 이미 cancelRun에서 처리되었으므로 무시한다.
    if (activeAbort?.signal.aborted) return;
    const msg = err instanceof Error ? err.message : String(err);
    updateRun({ status: "failed", error: msg, endedAt: Date.now() });
    appendRunLog({
      level: "error",
      step: "system",
      node: "execute",
      message: `Run 실행 실패: ${msg}`
    });
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

  let lastNodeUpdateAt = Date.now();
  const heartbeatTimer = setInterval(() => {
    const current = getRunState();
    if (!current || current.status !== "running") return;
    const elapsedSec = Math.floor((Date.now() - lastNodeUpdateAt) / 1000);
    appendRunLog({
      level: "info",
      step: current.currentStep === "idle" ? "system" : current.currentStep,
      node: "heartbeat",
      message: `노드 출력 대기 중... (${elapsedSec}초)`
    });
  }, 15_000);

  appendRunLog({
    level: "info",
    step: "ingestion",
    node: "pipeline",
    message: "파이프라인 그래프 스트림 시작"
  });

  try {
    for await (const update of stream) {
      for (const [nodeName, nodeOutput] of Object.entries(update)) {
        lastNodeUpdateAt = Date.now();
        const step = nodeToStep[nodeName];
        if (step) updateRun({ currentStep: step });
        appendRunLog({
          level: "info",
          step: step ?? "system",
          node: nodeName,
          message: `노드 업데이트 수신 (${nodeName})`
        });

        const output = nodeOutput as Record<string, unknown>;
        if (output.parsedRequirements !== undefined) {
          updateRun({ parsedRequirements: output.parsedRequirements as RunState["parsedRequirements"] });
          appendRunLog({
            level: "info",
            step: "analyze",
            node: nodeName,
            message: "파싱된 요구사항 저장 완료"
          });
        }
        if (output.riskAssessment !== undefined) {
          updateRun({ riskAssessment: output.riskAssessment as RunState["riskAssessment"] });
          appendRunLog({
            level: "info",
            step: "risk",
            node: nodeName,
            message: "위험 평가 저장 완료"
          });
        }
        if (output.executionPlan !== undefined) {
          updateRun({ executionPlan: output.executionPlan as RunState["executionPlan"] });
          appendRunLog({
            level: "info",
            step: "plan",
            node: nodeName,
            message: "실행 계획 저장 완료"
          });
        }
        if (output.error) {
          updateRun({ status: "failed", error: output.error as string, endedAt: Date.now() });
          appendRunLog({
            level: "error",
            step: step ?? "system",
            node: nodeName,
            message: `노드 오류: ${output.error as string}`
          });
          return;
        }

        // 목적: 결과 수신 직후 다음 단계를 선반영해, 장시간 LLM 호출 구간에서도 진행중임을 UI/로그에 표시한다.
        if (nodeName === "ingest") {
          updateRun({ currentStep: "analyze" });
          appendRunLog({
            level: "info",
            step: "analyze",
            node: "ingest->analyze",
            message: "데이터 수집 완료. 요구사항 분석 시작..."
          });
        } else if (nodeName === "analyze") {
          updateRun({ currentStep: "risk" });
          appendRunLog({
            level: "info",
            step: "risk",
            node: "analyze->assess_risk",
            message: "요구사항 분석 완료. 위험 평가 시작..."
          });
        } else if (nodeName === "assess_risk") {
          updateRun({ currentStep: "plan" });
          appendRunLog({
            level: "info",
            step: "plan",
            node: "assess_risk->plan",
            message: "위험 평가 완료. 실행 계획 수립 시작..."
          });
        }
      }
    }
  } finally {
    clearInterval(heartbeatTimer);
  }
}

// 목적: execution_order에 따라 태스크 그래프를 순차 실행한다.
async function executeTasksPhase(
  runId: string,
  tasks: TaskUnit[],
  executionOrder: string[],
  parsedRequirements: ParsedRequirements | null
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
      postVerification: null,
      approval: null,
      error: null,
      startedAt: Date.now(),
      endedAt: null,
      logs: []
    };
    const appendTaskLog = (
      entry: Omit<TaskLogEntry, "timestamp" | "step"> & {
        step?: TaskExecutionState["currentStep"];
        timestamp?: number;
      }
    ) => {
      const log: TaskLogEntry = {
        timestamp: entry.timestamp ?? Date.now(),
        level: entry.level,
        node: entry.node,
        message: entry.message,
        step: entry.step ?? taskState.currentStep
      };
      taskState.logs = [...(taskState.logs ?? []), log].slice(-MAX_TASK_LOGS);
    };
    appendTaskLog({
      level: "info",
      node: "task",
      message: `작업 시작: ${task.title}`
    });
    saveTaskState(runId, taskState);
    appendRunLog({
      level: "info",
      step: "execution",
      node: task.id,
      message: `작업 시작: ${task.id} ${task.title}`
    });

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
        { task, parsedRequirements },
        { signal: activeAbort?.signal, streamMode: "updates" }
      );

      let nodeFailed = false;
      stream_loop: for await (const update of stream) {
        for (const [nodeName, nodeOutput] of Object.entries(update)) {
          const step = nodeToStep[nodeName];
          if (step) taskState.currentStep = step;
          appendTaskLog({
            level: "info",
            node: nodeName,
            step: taskState.currentStep,
            message: `노드 업데이트: ${nodeName}`
          });

          const output = nodeOutput as Record<string, unknown>;
          if (output.changeSets !== undefined) taskState.changeSets = output.changeSets as TaskExecutionState["changeSets"];
          if (output.explanation !== undefined) taskState.explanation = output.explanation as TaskExecutionState["explanation"];
          if (output.verification !== undefined) taskState.verification = output.verification as TaskExecutionState["verification"];
          if (output.postVerification !== undefined) {
            taskState.postVerification = output.postVerification as TaskExecutionState["postVerification"];
          }
          if (output.approval !== undefined) taskState.approval = output.approval as TaskExecutionState["approval"];
          if (output.attempt !== undefined) taskState.attempt = output.attempt as TaskExecutionState["attempt"];
          if (output.error !== undefined) {
            taskState.error = output.error as string | null;
            nodeFailed = true;
            appendTaskLog({
              level: "error",
              node: nodeName,
              step: taskState.currentStep,
              message: `노드 오류: ${taskState.error ?? "알 수 없음"}`
            });
            appendRunLog({
              level: "error",
              step: "execution",
              node: `${task.id}:${nodeName}`,
              message: `작업 노드 실패: ${taskState.error ?? "알 수 없음"}`
            });
          }

          saveTaskState(runId, taskState);
          if (nodeFailed) break stream_loop;
        }
      }

      // 목적: 태스크 최종 상태를 결정한다.
      if (taskState.error) {
        taskState.status = "failed";
        appendTaskLog({
          level: "error",
          node: "task",
          message: `작업 실패: ${taskState.error}`
        });
      } else if (taskState.approval?.decision === "rejected") {
        taskState.status = "rejected";
        appendTaskLog({
          level: "error",
          node: "approval_gate",
          message: `작업 거부됨: ${taskState.approval.reason ?? "사유 없음"}`
        });
      } else if (taskState.postVerification?.verdict === "fail") {
        taskState.status = "failed";
        taskState.error = `post_verify failed: ${taskState.postVerification.failure_reasons.join("; ")}`;
        appendTaskLog({
          level: "error",
          node: "post_verify",
          message: taskState.error
        });
      } else {
        taskState.status = "completed";
        taskState.currentStep = "done";
        appendTaskLog({
          level: "info",
          node: "task",
          step: "done",
          message: "작업 완료"
        });
      }
      taskState.endedAt = Date.now();
      saveTaskState(runId, taskState);
      appendRunLog({
        level: taskState.status === "completed" ? "info" : "error",
        step: "execution",
        node: task.id,
        message: `작업 ${taskState.status === "completed" ? "완료" : taskState.status === "failed" ? "실패" : taskState.status}`
      });

      if (taskState.status === "failed" || taskState.status === "rejected") {
        updateRun({
          status: "failed",
          error: `Task ${task.id} ${taskState.status}: ${taskState.error ?? taskState.approval?.reason ?? "unknown"}`,
          endedAt: Date.now()
        });
        appendRunLog({
          level: "error",
          step: "execution",
          node: task.id,
          message: `작업 ${task.id} ${taskState.status === "failed" ? "실패" : "거부"}로 인해 Run 실패`
        });
        return;
      }
    } catch (err) {
      if (activeAbort?.signal.aborted) break;
      taskState.status = "failed";
      taskState.error = err instanceof Error ? err.message : String(err);
      appendTaskLog({
        level: "error",
        node: "task",
        message: `작업 예외: ${taskState.error}`
      });
      taskState.endedAt = Date.now();
      saveTaskState(runId, taskState);
      updateRun({
        status: "failed",
        error: `작업 ${task.id} 실패: ${taskState.error}`,
        endedAt: Date.now()
      });
      appendRunLog({
        level: "error",
        step: "execution",
        node: task.id,
        message: `작업 예외: ${taskState.error}`
      });
      return;
    }
  }
}
