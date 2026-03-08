// 책임: Todo 실행 플로우 IPC 핸들러를 등록한다. TodoFlowService에 위임한다.

import { ipcMain } from "electron";
import { IPC_CHANNELS, type TodoFlowExecuteAllRequest, type TodoFlowStartRequest } from "../../shared/ipc";
import type { TodoFlowService } from "../services/flow/todo-flow-service";

export function registerTodoFlowIpc(service: TodoFlowService) {
  // 목적: 단일 Todo 실행 플로우를 시작한다.
  ipcMain.handle(IPC_CHANNELS.todoFlowStart, (_event, request: TodoFlowStartRequest) => {
    return service.startFlow(request);
  });

  // 목적: 특정 Todo의 실행 상태를 반환한다.
  ipcMain.handle(IPC_CHANNELS.todoFlowGetState, (_event, todoId: string) => {
    return service.getState(todoId);
  });

  // 목적: 특정 Todo의 실행을 취소한다.
  ipcMain.handle(IPC_CHANNELS.todoFlowCancel, (_event, todoId: string) => {
    return service.cancelFlow(todoId);
  });

  // 목적: 전체 Todo를 wave 기반으로 실행한다.
  ipcMain.handle(IPC_CHANNELS.todoFlowExecuteAll, (_event, request: TodoFlowExecuteAllRequest) => {
    // 이유: fire-and-forget — executeAll은 백그라운드에서 실행되므로 즉시 accepted 반환.
    service.executeAll(request.provider, request.cwd);
    return { status: "accepted" };
  });

  // 목적: 모든 Todo의 실행 상태를 일괄 반환한다.
  ipcMain.handle(IPC_CHANNELS.todoFlowGetAllStates, () => {
    return service.getAllStates();
  });
}
