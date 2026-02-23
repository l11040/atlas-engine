// 책임: LangChain 플로우 IPC 핸들러를 등록한다.

import { ipcMain } from "electron";
import {
  IPC_CHANNELS,
  type FlowCancelRequest,
  type FlowEvent,
  type FlowInvokeRequest
} from "../../shared/ipc";
import { getSettings } from "../services/config/settings";
import { CliLlm } from "../services/langchain/cli-llm";
import { IpcFlowCallbackHandler } from "../services/langchain/langchain-ipc-callback";
import { buildTicketToTodoGraph } from "../services/langchain/ticket-to-todo-graph";

// 목적: flowId별 AbortController를 관리하여 취소를 지원한다.
const runningFlows = new Map<string, AbortController>();

function emitFlowEvent(target: Electron.WebContents, event: FlowEvent) {
  if (target.isDestroyed()) return;
  target.send(IPC_CHANNELS.flowEvent, event);
}

// 목적: 기존 prompt 기반 단일 LLM 호출 플로우를 실행한다.
function runPromptFlow(
  request: FlowInvokeRequest,
  model: CliLlm,
  emit: (e: FlowEvent) => void
) {
  const callbackHandler = new IpcFlowCallbackHandler(request.flowId, emit);

  model
    .invoke(request.prompt, { callbacks: [callbackHandler] })
    .then((result) => {
      runningFlows.delete(request.flowId);
      emit({ flowId: request.flowId, type: "flow-end", result, timestamp: Date.now() });
    })
    .catch((error) => {
      runningFlows.delete(request.flowId);
      emit({
        flowId: request.flowId,
        type: "flow-error",
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
    });
}

// 목적: Ticket → Todo 변환 LangGraph 플로우를 실행한다.
// 이유: graph.stream()을 사용하여 노드별 진행을 flow event로 스트리밍한다.
function runTicketToTodoFlow(
  request: FlowInvokeRequest,
  model: CliLlm,
  emit: (e: FlowEvent) => void
) {
  const settings = getSettings();
  const ticket = settings.ticket;

  if (!ticket) {
    emit({
      flowId: request.flowId,
      type: "flow-error",
      error: "설정에 티켓이 없습니다. 설정에서 티켓 JSON을 먼저 입력하세요.",
      timestamp: Date.now()
    });
    runningFlows.delete(request.flowId);
    return;
  }

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

  (async () => {
    try {
      let finalState: Record<string, unknown> = {};

      // 목적: 노드별 실행 결과를 스트리밍하여 UI에서 phase pipeline 진행을 표시한다.
      const stream = await graph.stream(initialState, { streamMode: "updates" });
      for await (const chunk of stream) {
        for (const [nodeName, update] of Object.entries(chunk)) {
          emit({
            flowId: request.flowId,
            type: "node-start",
            nodeId: nodeName,
            nodeName,
            input: "",
            timestamp: Date.now()
          });
          emit({
            flowId: request.flowId,
            type: "node-end",
            nodeId: nodeName,
            output: JSON.stringify(update),
            timestamp: Date.now()
          });
          finalState = { ...finalState, ...(update as Record<string, unknown>) };
        }
      }

      runningFlows.delete(request.flowId);
      emit({
        flowId: request.flowId,
        type: "flow-end",
        result: JSON.stringify(finalState),
        timestamp: Date.now()
      });
    } catch (error) {
      runningFlows.delete(request.flowId);
      emit({
        flowId: request.flowId,
        type: "flow-error",
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
    }
  })();
}

export function registerFlowIpc() {
  // 목적: flowType에 따라 적절한 플로우를 실행한다.
  ipcMain.handle(IPC_CHANNELS.flowInvoke, async (event, request: FlowInvokeRequest) => {
    try {
      if (!request.flowId) {
        return { status: "rejected", flowId: request.flowId, message: "flowId는 필수입니다" };
      }

      if (runningFlows.has(request.flowId)) {
        return { status: "rejected", flowId: request.flowId, message: "해당 flowId가 이미 실행 중입니다" };
      }

      const settings = getSettings();
      const abortController = new AbortController();
      runningFlows.set(request.flowId, abortController);

      const target = event.sender;
      const emit = (flowEvent: FlowEvent) => emitFlowEvent(target, flowEvent);

      emit({ flowId: request.flowId, type: "flow-start", timestamp: Date.now() });

      const model = new CliLlm({
        provider: request.provider,
        cwd: request.cwd || settings.defaultCwd || process.cwd(),
        permissionMode: settings.cli.permissionMode,
        timeoutMs: settings.cli.timeoutMs
      });

      const flowType = request.flowType || "prompt";

      if (flowType === "ticket-to-todo") {
        runTicketToTodoFlow(request, model, emit);
      } else {
        if (!request.prompt?.trim()) {
          runningFlows.delete(request.flowId);
          return { status: "rejected", flowId: request.flowId, message: "prompt는 필수입니다" };
        }
        runPromptFlow(request, model, emit);
      }

      return { status: "accepted", flowId: request.flowId };
    } catch (error) {
      console.error("[ipc] flow:invoke exception", error);
      throw error;
    }
  });

  // 목적: 실행 중인 플로우를 취소한다.
  ipcMain.handle(IPC_CHANNELS.flowCancel, (_event, request: FlowCancelRequest) => {
    try {
      const controller = runningFlows.get(request.flowId);
      if (controller) {
        controller.abort();
        runningFlows.delete(request.flowId);
      }
    } catch (error) {
      console.error("[ipc] flow:cancel exception", error);
      throw error;
    }
  });
}
