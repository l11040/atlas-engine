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

// 목적: flowId별 AbortController를 관리하여 취소를 지원한다.
const runningFlows = new Map<string, AbortController>();

function emitFlowEvent(target: Electron.WebContents, event: FlowEvent) {
  if (target.isDestroyed()) return;
  target.send(IPC_CHANNELS.flowEvent, event);
}

export function registerFlowIpc() {
  // 목적: LangChain CliLlm을 생성하고 플로우를 실행한다.
  ipcMain.handle(IPC_CHANNELS.flowInvoke, async (event, request: FlowInvokeRequest) => {
    try {
      if (!request.flowId || !request.prompt.trim()) {
        return { status: "rejected", flowId: request.flowId, message: "flowId와 prompt는 필수입니다" };
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

      const callbackHandler = new IpcFlowCallbackHandler(request.flowId, emit);

      // 이유: invoke를 비동기로 실행하고 즉시 accepted를 반환하여 렌더러가 블로킹되지 않도록 한다.
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
