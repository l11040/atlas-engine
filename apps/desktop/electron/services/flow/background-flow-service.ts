// 책임: 백그라운드 플로우 실행 생명주기를 관리한다. 렌더러 윈도우와 독립적으로 동작한다.

import type {
  ActivityLogEntry,
  FlowInvokeRequest,
  FlowInvokeResponse,
  FlowNodeProgress,
  FlowState,
  PipelinePhase,
  PipelineState,
  TodoItem
} from "../../../shared/ipc";
import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";
import { getSettings, updateSettings } from "../config/settings";
import { CliLlm } from "../langchain/cli-llm";
import { buildTicketToTodoGraph } from "../langchain/graphs/ticket-to-todo";
import { applyTracingEnv, clearTracingEnv } from "../langchain/tracing-env";
import { FlowStateStore, INITIAL_FLOW_STATE } from "./flow-state-store";

// 목적: 그래프 노드 이름을 PipelinePhase에 매핑한다.
const NODE_PHASE_MAP: Record<string, string> = {
  dor_formal: "dor",
  dor_semantic: "dor",
  build_todos: "plan",
  finalize: "plan",
  hold_end: "hold"
};

export class BackgroundFlowService {
  private store = new FlowStateStore();
  private abortController: AbortController | null = null;

  // 목적: 앱 시작 시 디스크에서 상태를 복원하고, running 상태를 interrupted로 마킹한다.
  async initialize(): Promise<void> {
    await this.store.loadFromDisk();
    const state = this.store.getSnapshot();
    if (state.status === "running") {
      await this.store.update({
        status: "interrupted",
        endedAt: Date.now()
      });
    }
  }

  // 목적: 플로우를 시작한다. 이미 실행 중이면 거부한다.
  async startFlow(request: FlowInvokeRequest): Promise<FlowInvokeResponse> {
    if (!request.flowId) {
      return { status: "rejected", flowId: request.flowId, message: "flowId는 필수입니다" };
    }

    const current = this.store.getSnapshot();
    if (current.status === "running") {
      return { status: "rejected", flowId: request.flowId, message: "이미 실행 중인 플로우가 있습니다" };
    }

    const flowType = request.flowType || "prompt";

    // 목적: 상태를 초기화하고 실행을 시작한다.
    const initialUpdate: Partial<FlowState> = {
      ...INITIAL_FLOW_STATE,
      flowId: request.flowId,
      flowType,
      status: "running",
      startedAt: Date.now()
    };

    // 목적: 재실행 시 스킵된 이전 단계의 결과를 즉시 보존한다.
    // 이유: fire-and-forget 그래프 실행보다 먼저 반영해야 렌더러 첫 폴링에서 이전 결과가 보인다.
    if (request.startFromNode) {
      const settings = getSettings();
      const saved = settings.pipeline;
      if (saved) {
        const node = request.startFromNode;
        if (node === "dor_semantic" || node === "build_todos") {
          initialUpdate.dorFormalResult = saved.dorFormalResult;
          initialUpdate.dorFormalReason = saved.dorFormalReason ?? "";
        }
        if (node === "build_todos") {
          initialUpdate.dorSemanticResult = saved.dorSemanticResult;
          initialUpdate.dorSemanticReason = saved.dorSemanticReason ?? "";
        }
      }
      initialUpdate.currentPhase = (NODE_PHASE_MAP[request.startFromNode] ?? "dor") as PipelinePhase;
    }

    await this.store.update(initialUpdate);

    this.abortController = new AbortController();

    if (flowType === "ticket-to-todo") {
      this.runTicketToTodoGraph(request);
    } else {
      this.runPromptFlow(request);
    }

    return { status: "accepted", flowId: request.flowId };
  }

  // 목적: 실행 중인 플로우를 취소한다.
  async cancelFlow(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    const current = this.store.getSnapshot();
    if (current.status === "running") {
      await this.store.update({
        status: "error",
        error: "사용자에 의해 취소되었습니다",
        endedAt: Date.now()
      });
    }
  }

  // 목적: 현재 FlowState 스냅샷을 반환한다.
  getState() {
    return this.store.getSnapshot();
  }

  // 목적: 완료된 상태를 리셋한다.
  async resetState(): Promise<void> {
    if (this.store.getSnapshot().status === "running") return;
    await this.store.reset();
  }

  // 목적: Ticket → Todo 변환 LangGraph 플로우를 백그라운드에서 실행한다.
  private async runTicketToTodoGraph(request: FlowInvokeRequest): Promise<void> {
    try {
      const settings = getSettings();
      // 목적: LangSmith 추적이 활성화된 경우 환경 변수를 주입한다.
      applyTracingEnv(settings.tracing);
      const ticket = settings.ticket;

      if (!ticket) {
        await this.store.update({
          status: "error",
          error: "설정에 티켓이 없습니다. 설정에서 티켓 JSON을 먼저 입력하세요.",
          endedAt: Date.now()
        });
        return;
      }

      const model = new CliLlm({
        provider: request.provider,
        cwd: request.cwd || settings.defaultCwd || process.cwd(),
        permissionMode: settings.cli.permissionMode,
        timeoutMs: settings.cli.timeoutMs
      });

      const startFromNode = request.startFromNode;
      const graph = buildTicketToTodoGraph(model, startFromNode);

      // 목적: 재실행 시 이전 단계의 저장된 결과를 초기 상태로 주입한다.
      // 이유: 스킵된 노드의 결과가 후속 노드에서 참조될 수 있다.
      let initialState: Record<string, unknown> = { ticket };
      if (startFromNode && settings.pipeline) {
        const saved = settings.pipeline;
        if (startFromNode === "dor_semantic") {
          initialState.dorFormalResult = saved.dorFormalResult ?? "pass";
          initialState.dorFormalReason = saved.dorFormalReason ?? "";
        } else if (startFromNode === "build_todos") {
          initialState.dorFormalResult = saved.dorFormalResult ?? "pass";
          initialState.dorFormalReason = saved.dorFormalReason ?? "";
          initialState.dorSemanticResult = saved.dorSemanticResult ?? "proceed";
          initialState.dorSemanticReason = saved.dorSemanticReason ?? "";
        }
      }

      // 이유: 이전 단계 결과의 FlowState 반영은 startFlow()에서 이미 처리했으므로 여기서는 생략한다.

      // 목적: 추적 메타데이터(실행 이름, 태그)를 전달하여 LangSmith에서 식별 가능하게 한다.
      const runName = ticket.jira_key
        ? `ticket-to-todo:${ticket.jira_key}`
        : "ticket-to-todo";

      const stream = await graph.stream(initialState, {
        streamMode: "updates",
        runName,
        tags: ["ticket-to-todo", request.provider]
      });

      for await (const chunk of stream) {
        for (const [nodeName, update] of Object.entries(chunk)) {
          const typed = update as Record<string, unknown>;
          const now = Date.now();
          const currentProgress = this.store.getSnapshot().nodeProgress;

          // 목적: 노드 진행 상태를 기록한다.
          const nodeProgress: FlowNodeProgress[] = [
            ...currentProgress.map((n) =>
              n.status === "running" ? { ...n, status: "completed" as const, endedAt: now } : n
            ),
            { nodeName, status: "completed" as const, startedAt: now, endedAt: now }
          ];

          // 목적: 그래프 상태 필드를 FlowState에 직접 병합한다.
          const currentState = this.store.getSnapshot();
          const partial: Partial<FlowState> = { nodeProgress };

          if (typed.phase) partial.currentPhase = typed.phase as PipelinePhase;
          if (typed.dorFormalResult) partial.dorFormalResult = typed.dorFormalResult as "pass" | "hold";
          if (typed.dorFormalReason) partial.dorFormalReason = typed.dorFormalReason as string;
          if (typed.dorSemanticResult) partial.dorSemanticResult = typed.dorSemanticResult as "proceed" | "hold";
          if (typed.dorSemanticReason) partial.dorSemanticReason = typed.dorSemanticReason as string;
          if (typed.todos) partial.todos = typed.todos as TodoItem[];
          if (typed.holdReason) partial.holdReason = typed.holdReason as string;
          if (typed.activityLog) {
            partial.activityLog = [...currentState.activityLog, ...(typed.activityLog as ActivityLogEntry[])];
          }
          // 목적: hold 상태에서 holdAtPhase를 결정한다.
          if (typed.phase === "hold") {
            partial.holdAtPhase = this.computeHoldAtPhase(nodeProgress);
          }

          // 목적: dor_semantic 완료 후 build_todos 실행 전에 currentPhase를 "plan"으로 선행 반영한다.
          // 이유: streamMode "updates"는 노드 완료 시에만 이벤트를 발생시킨다.
          // build_todos 실행 중(완료 전) UI가 "dor"에 머무는 것을 방지한다.
          if (nodeName === "dor_semantic" && typed.dorSemanticResult === "proceed") {
            partial.currentPhase = "plan" as PipelinePhase;
          }

          await this.store.update(partial);
        }
      }

      await this.store.update({
        status: "completed",
        endedAt: Date.now()
      });
      await this.savePipelineToSettings();
    } catch (error) {
      await this.store.update({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        endedAt: Date.now()
      });
      // 목적: 에러 상태에서도 부분 결과를 settings에 저장한다.
      await this.savePipelineToSettings();
    } finally {
      this.abortController = null;
      // 목적: 비동기 트레이스 전송이 완료된 뒤 환경 변수를 제거한다.
      await awaitAllCallbacks();
      clearTracingEnv();
    }
  }

  // 목적: 기존 prompt 기반 단일 LLM 호출 플로우를 실행한다.
  private async runPromptFlow(request: FlowInvokeRequest): Promise<void> {
    try {
      const settings = getSettings();
      applyTracingEnv(settings.tracing);

      if (!request.prompt?.trim()) {
        await this.store.update({
          status: "error",
          error: "prompt는 필수입니다",
          endedAt: Date.now()
        });
        return;
      }

      const model = new CliLlm({
        provider: request.provider,
        cwd: request.cwd || settings.defaultCwd || process.cwd(),
        permissionMode: settings.cli.permissionMode,
        timeoutMs: settings.cli.timeoutMs
      });

      await this.store.update({
        nodeProgress: [{ nodeName: "LLM", status: "running", startedAt: Date.now() }]
      });

      const result = await model.invoke(request.prompt);

      await this.store.update({
        nodeProgress: [{ nodeName: "LLM", status: "completed", startedAt: Date.now(), endedAt: Date.now() }],
        status: "completed",
        endedAt: Date.now()
      });
    } catch (error) {
      await this.store.update({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        endedAt: Date.now()
      });
    } finally {
      this.abortController = null;
      await awaitAllCallbacks();
      clearTracingEnv();
    }
  }

  // 목적: hold 상태 진입 시 마지막으로 완료된 노드의 phase를 반환한다.
  private computeHoldAtPhase(nodeProgress: FlowNodeProgress[]): PipelinePhase {
    const beforeHold = nodeProgress.filter(
      (n) => n.nodeName !== "hold_end" && n.nodeName !== "finalize"
    );
    const last = beforeHold[beforeHold.length - 1];
    return (last ? (NODE_PHASE_MAP[last.nodeName] ?? "dor") : "dor") as PipelinePhase;
  }

  // 목적: 플로우 완료/에러 시 결과를 settings.pipeline에 저장한다.
  private async savePipelineToSettings(): Promise<void> {
    const state = this.store.getSnapshot();
    const pipelineState: PipelineState = {
      currentPhase: state.currentPhase,
      holdAtPhase: state.holdAtPhase as PipelineState["holdAtPhase"],
      dorFormalResult: state.dorFormalResult,
      dorFormalReason: state.dorFormalReason,
      dorSemanticResult: state.dorSemanticResult,
      dorSemanticReason: state.dorSemanticReason,
      todos: state.todos,
      holdReason: state.holdReason,
      activityLog: state.activityLog
    };
    await updateSettings({ pipeline: pipelineState });
  }
}
