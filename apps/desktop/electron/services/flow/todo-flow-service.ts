// 책임: Todo별 독립 실행 플로우를 백그라운드에서 관리한다. 디스크 영속화를 지원한다.
// 이유: Todo는 wave 내에서 병렬 실행되므로, 단일 BackgroundFlowService와 별도로 다중 실행을 지원한다.

import type {
  ProviderType,
  TodoFlowAllStatesResponse,
  TodoFlowBackendState,
  TodoFlowPhase,
  TodoFlowStartRequest,
  TodoFlowStartResponse,
  TodoFlowStatus,
  TodoFlowStepState,
  TodoItem
} from "../../../shared/ipc";
import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";
import { getSettings } from "../config/settings";
import { CliLlm } from "../langchain/cli-llm";
import { buildTodoExecutionGraph } from "../langchain/graphs/todo-execution";
import type { TodoExecutionState } from "../langchain/graphs/todo-execution";
import { applyTracingEnv, clearTracingEnv } from "../langchain/tracing-env";
import { TodoFlowStateStore } from "./todo-flow-state-store";

const FLOW_PHASES: TodoFlowPhase[] = ["workorder", "explore", "execute", "verify", "dod"];

// 목적: 그래프 노드 이름을 TodoFlowPhase에 매핑한다.
const NODE_PHASE_MAP: Record<string, TodoFlowPhase> = {
  compose_workorder: "workorder",
  explore: "explore",
  execute: "execute",
  verify: "verify",
  dod_check: "dod"
};

function createInitialSteps(): TodoFlowStepState[] {
  return FLOW_PHASES.map((phase) => ({
    phase,
    status: "idle" as TodoFlowStatus,
    startedAt: null,
    endedAt: null,
    result: null,
    error: null
  }));
}

function createInitialBackendState(todoId: string): TodoFlowBackendState {
  return {
    todoId,
    status: "idle",
    currentPhase: null,
    steps: createInitialSteps(),
    workOrder: null,
    evidence: null,
    finalVerdict: null,
    error: null,
    startedAt: null,
    endedAt: null
  };
}

// ─── Wave 실행 계획 ──────────────────────────────────────

interface ExecutionWave {
  index: number;
  todoIds: string[];
}

// 목적: deps 기반 위상 정렬로 Todo를 wave 단위로 그룹화한다.
function buildExecutionWaves(todos: TodoItem[]): ExecutionWave[] {
  const todoMap = new Map(todos.map((t) => [t.id, t]));
  const placed = new Set<string>();
  const waves: ExecutionWave[] = [];

  const getValidDeps = (todo: TodoItem): string[] =>
    todo.deps.filter((depId) => todoMap.has(depId));

  const remaining = new Set(todos.map((t) => t.id));
  let waveIndex = 0;

  while (remaining.size > 0) {
    const waveIds: string[] = [];
    for (const todoId of remaining) {
      const todo = todoMap.get(todoId)!;
      const deps = getValidDeps(todo);
      if (deps.every((depId) => placed.has(depId))) {
        waveIds.push(todoId);
      }
    }

    // 주의: 순환 의존성이 있으면 남은 Todo를 마지막 wave에 강제 배치한다.
    if (waveIds.length === 0) {
      waves.push({ index: waveIndex, todoIds: [...remaining] });
      break;
    }

    waves.push({ index: waveIndex, todoIds: waveIds });
    for (const id of waveIds) {
      placed.add(id);
      remaining.delete(id);
    }
    waveIndex++;
  }

  return waves;
}

// ─── TodoFlowService ─────────────────────────────────────

export class TodoFlowService {
  private store = new TodoFlowStateStore();
  private abortControllers = new Map<string, AbortController>();
  // 목적: executeAll 실행 중 여부를 추적한다.
  private executingAll = false;

  // 목적: 앱 시작 시 디스크에서 상태를 복원하고, running 상태를 interrupted로 마킹한다.
  async initialize(): Promise<void> {
    await this.store.loadFromDisk();
    await this.store.markAllRunningAsInterrupted();
  }

  // 목적: 단일 Todo의 실행 플로우를 시작한다.
  async startFlow(request: TodoFlowStartRequest): Promise<TodoFlowStartResponse> {
    const { todoId, provider, startFromNode } = request;

    // 이유: 이미 실행 중인 Todo는 중복 실행을 거부한다.
    const current = this.store.getState(todoId);
    if (current?.status === "running") {
      return { status: "rejected", todoId, message: `Todo ${todoId}가 이미 실행 중입니다` };
    }

    const now = Date.now();
    const state = createInitialBackendState(todoId);
    state.status = "running";
    state.startedAt = now;

    // 목적: 중간 재시작 시 이전 단계 결과를 보존한다.
    if (startFromNode) {
      const prevState = this.store.getState(todoId);
      if (prevState) {
        state.workOrder = prevState.workOrder;
        state.evidence = prevState.evidence;
        // 이유: 이전 단계의 step 결과를 보존하여 UI에서 확인 가능하게 한다.
        const startPhaseIndex = FLOW_PHASES.indexOf(NODE_PHASE_MAP[startFromNode] ?? "workorder");
        for (let i = 0; i < startPhaseIndex && i < prevState.steps.length; i++) {
          state.steps[i] = { ...prevState.steps[i]! };
        }
      }
    }

    // 목적: 시작 노드에 해당하는 phase를 현재 phase로 설정한다.
    const startPhase = startFromNode ? (NODE_PHASE_MAP[startFromNode] ?? "workorder") : "workorder";
    state.currentPhase = startPhase;
    const startIndex = FLOW_PHASES.indexOf(startPhase);
    if (startIndex >= 0 && state.steps[startIndex]) {
      state.steps[startIndex]!.status = "running";
      state.steps[startIndex]!.startedAt = now;
    }

    this.store.setState(todoId, state);
    await this.store.saveMeta(todoId);
    await this.store.saveSteps(todoId);
    await this.store.saveActivePointer();

    const abortController = new AbortController();
    this.abortControllers.set(todoId, abortController);

    // 목적: fire-and-forget으로 그래프를 실행한다.
    this.runTodoExecutionGraph(todoId, provider, request.cwd, startFromNode);

    return { status: "accepted", todoId };
  }

  // 목적: 전체 Todo를 wave 순서에 따라 실행한다. 같은 wave 내 병렬, wave 간 직렬.
  async executeAll(provider: ProviderType, cwd?: string): Promise<{ completed: number; failed: number }> {
    if (this.executingAll) {
      return { completed: 0, failed: 0 };
    }
    this.executingAll = true;

    try {
      const settings = getSettings();
      const todos: TodoItem[] = settings.pipeline?.todos || [];
      if (todos.length === 0) {
        return { completed: 0, failed: 0 };
      }

      const waves = buildExecutionWaves(todos);
      let totalCompleted = 0;
      let totalFailed = 0;

      for (const wave of waves) {
        // 목적: wave 내 Todo들을 병렬로 시작한다.
        const promises: Promise<void>[] = [];
        for (const todoId of wave.todoIds) {
          await this.startFlow({ todoId, provider, cwd });
          promises.push(this.waitForTodoCompletion(todoId));
        }

        // 목적: wave 내 모든 Todo가 완료될 때까지 대기한다.
        await Promise.all(promises);

        // 목적: wave 결과를 집계한다.
        for (const todoId of wave.todoIds) {
          const state = this.store.getState(todoId);
          if (state?.status === "completed") totalCompleted++;
          else totalFailed++;
        }
      }

      return { completed: totalCompleted, failed: totalFailed };
    } finally {
      this.executingAll = false;
    }
  }

  // 목적: 특정 Todo의 실행 상태를 반환한다.
  getState(todoId: string): TodoFlowBackendState | null {
    return this.store.getState(todoId);
  }

  // 목적: 모든 Todo의 실행 상태를 반환한다.
  getAllStates(): TodoFlowAllStatesResponse {
    return this.store.getAllStates();
  }

  // 목적: 전체 실행 중 여부를 반환한다.
  getIsExecutingAll(): boolean {
    return this.executingAll;
  }

  // 목적: 특정 Todo의 실행을 취소한다.
  async cancelFlow(todoId: string): Promise<void> {
    const controller = this.abortControllers.get(todoId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(todoId);
    }

    const state = this.store.getState(todoId);
    if (state && state.status === "running") {
      state.status = "error";
      state.error = "사용자에 의해 취소되었습니다";
      state.endedAt = Date.now();
      this.store.setState(todoId, state);
      await this.store.saveMeta(todoId);
    }
  }

  // ─── 내부 실행 ─────────────────────────────────────────

  // 목적: Todo 실행 그래프를 백그라운드에서 실행하고, 스트림으로 단계별 상태를 갱신한다.
  private async runTodoExecutionGraph(
    todoId: string,
    provider: ProviderType,
    cwd?: string,
    startFromNode?: string
  ): Promise<void> {
    try {
      const settings = getSettings();
      applyTracingEnv(settings.tracing);

      const ticket = settings.ticket;
      if (!ticket) {
        await this.markError(todoId, "설정에 티켓이 없습니다");
        return;
      }

      const todos: TodoItem[] = settings.pipeline?.todos || [];
      const todo = todos.find((t) => t.id === todoId);
      if (!todo) {
        await this.markError(todoId, `Todo ${todoId}를 찾을 수 없습니다`);
        return;
      }

      const model = new CliLlm({
        provider,
        cwd: cwd || settings.defaultCwd || process.cwd(),
        // 목적: 백그라운드 todo-flow는 사용자 상호작용 없이 실행되므로 auto 권한 모드로 고정한다.
        permissionMode: "auto",
        timeoutMs: settings.cli.timeoutMs,
        // 목적: todo-execution 그래프는 explore/execute/verify 단계에서 실제 도구 실행이 필요하다.
        allowTools: true
      });

      const graph = buildTodoExecutionGraph(model, startFromNode);

      // 목적: 중간 재시작 시 이전 노드의 산출물을 초기 상태에 주입한다.
      const initialState: Record<string, unknown> = {
        todo,
        jiraKey: ticket.jira_key,
        mode: ticket.mode,
        cwd: cwd || settings.defaultCwd || process.cwd()
      };

      if (startFromNode) {
        const prevState = this.store.getState(todoId);
        if (prevState) {
          // 이유: 스킵된 노드의 산출물이 후속 노드에서 참조될 수 있다.
          const workorderStep = prevState.steps.find((s) => s.phase === "workorder");
          const exploreStep = prevState.steps.find((s) => s.phase === "explore");
          const executeStep = prevState.steps.find((s) => s.phase === "execute");
          const verifyStep = prevState.steps.find((s) => s.phase === "verify");

          if (workorderStep?.result && startFromNode !== "compose_workorder") {
            const result = workorderStep.result as Record<string, unknown>;
            // 목적: 구버전({ workOrder })과 신버전(raw object) 모두 복원 가능하게 처리한다.
            initialState.workOrder = (result.workOrder as Record<string, unknown>) ?? result;
          }
          if (exploreStep?.result && startFromNode !== "explore") {
            const result = exploreStep.result as Record<string, unknown>;
            initialState.contextPack = (result.contextPack as Record<string, unknown>) ?? result;
          }
          if (executeStep?.result && startFromNode !== "execute") {
            const result = executeStep.result as Record<string, unknown>;
            initialState.implReport = (result.implReport as Record<string, unknown>) ?? result;
          }
          if (verifyStep?.result && startFromNode !== "verify") {
            const result = verifyStep.result as Record<string, unknown>;
            initialState.evidence = (result.evidence as Record<string, unknown>) ?? result;
          }
        }
      }

      const runName = `todo-execution:${ticket.jira_key}:${todoId}`;

      const stream = await graph.stream(initialState, {
        streamMode: "updates",
        runName,
        tags: ["todo-execution", provider, todoId]
      });

      for await (const chunk of stream) {
        for (const [nodeName, update] of Object.entries(chunk)) {
          const typed = update as Partial<TodoExecutionState>;
          const phase = NODE_PHASE_MAP[nodeName];
          if (!phase) continue;

          await this.updateStepFromNode(todoId, phase, typed);
        }
      }

      // 목적: 그래프 실행 완료 후 최종 상태를 반영한다.
      const finalState = this.store.getState(todoId);
      if (finalState && finalState.status === "running") {
        finalState.status = "completed";
        finalState.endedAt = Date.now();
        this.store.setState(todoId, finalState);
        await this.store.saveMeta(todoId);
        await this.store.saveActivePointer();
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await this.markError(todoId, msg);
    } finally {
      this.abortControllers.delete(todoId);
      await awaitAllCallbacks();
      clearTracingEnv();
    }
  }

  // 목적: 그래프 노드 완료 이벤트로 steps 배열을 갱신하고 디스크에 저장한다.
  private async updateStepFromNode(
    todoId: string,
    phase: TodoFlowPhase,
    update: Partial<TodoExecutionState>
  ): Promise<void> {
    const state = this.store.getState(todoId);
    if (!state) return;

    const now = Date.now();
    const phaseIndex = FLOW_PHASES.indexOf(phase);

    // 목적: 현재 단계를 completed로 전환하고 결과를 저장한다.
    if (phaseIndex >= 0) {
      const step = state.steps[phaseIndex]!;
      step.status = "completed";
      step.endedAt = now;

      // 목적: 노드 결과를 step.result에 저장하고 artifact 파일로도 저장한다.
      if (update.workOrder) {
        step.result = update.workOrder as unknown as Record<string, unknown>;
        await this.store.saveNodeArtifact(todoId, "workorder", update.workOrder);
      }
      if (update.contextPack) {
        step.result = update.contextPack as unknown as Record<string, unknown>;
        await this.store.saveNodeArtifact(todoId, "explore", update.contextPack);
      }
      if (update.implReport) {
        step.result = update.implReport as unknown as Record<string, unknown>;
        await this.store.saveNodeArtifact(todoId, "execute", update.implReport);
      }
      if (update.evidence) {
        step.result = update.evidence as unknown as Record<string, unknown>;
        await this.store.saveNodeArtifact(todoId, "verify", update.evidence);
      }
      if (update.dodResult) {
        step.result = {
          dodResult: update.dodResult,
          dodReason: update.dodReason,
          finalVerdict: update.finalVerdict ?? null
        };
        await this.store.saveNodeArtifact(todoId, "dod", step.result);
      }

      if (update.error) {
        step.status = "error";
        step.error = update.error;
      }
    }

    // 목적: 다음 단계를 running으로 전환한다.
    const nextIndex = phaseIndex + 1;
    if (nextIndex < FLOW_PHASES.length && !update.error) {
      const nextStep = state.steps[nextIndex]!;
      nextStep.status = "running";
      nextStep.startedAt = now;
      state.currentPhase = FLOW_PHASES[nextIndex]!;
    }

    // 목적: 그래프 수준 상태를 반영한다.
    if (update.workOrder) state.workOrder = update.workOrder as unknown as Record<string, unknown>;
    if (update.evidence) state.evidence = update.evidence as unknown as Record<string, unknown>;
    if (update.finalVerdict) state.finalVerdict = update.finalVerdict;
    if (update.error) state.error = update.error;

    this.store.setState(todoId, state);

    // 목적: 변경된 상태를 디스크에 즉시 저장한다.
    await this.store.saveMeta(todoId);
    await this.store.saveSteps(todoId);

    // 목적: 활동 로그가 있으면 append한다.
    if (update.activityLog && update.activityLog.length > 0) {
      await this.store.appendActivity(todoId, update.activityLog);
    }
  }

  private async markError(todoId: string, message: string): Promise<void> {
    const state = this.store.getState(todoId) ?? createInitialBackendState(todoId);
    state.status = "error";
    state.error = message;
    state.endedAt = Date.now();
    this.store.setState(todoId, state);
    await this.store.saveMeta(todoId);
    await this.store.saveActivePointer();
  }

  // 목적: 특정 Todo가 완료(또는 에러)될 때까지 폴링으로 대기한다.
  private waitForTodoCompletion(todoId: string): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        const state = this.store.getState(todoId);
        if (!state || state.status !== "running") {
          resolve();
          return;
        }
        setTimeout(check, 500);
      };
      check();
    });
  }
}
