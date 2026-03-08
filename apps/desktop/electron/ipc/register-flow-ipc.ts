// 책임: 백그라운드 플로우 IPC 핸들러를 등록한다. BackgroundFlowService에 위임한다.

import { ipcMain } from "electron";
import { IPC_CHANNELS, type FlowCancelRequest, type FlowInvokeRequest } from "../../shared/ipc";
import type { BackgroundFlowService } from "../services/flow/background-flow-service";

export function registerFlowIpc(service: BackgroundFlowService) {
  ipcMain.handle(IPC_CHANNELS.flowInvoke, (_event, request: FlowInvokeRequest) => {
    return service.startFlow(request);
  });

  ipcMain.handle(IPC_CHANNELS.flowCancel, (_event, _request: FlowCancelRequest) => {
    return service.cancelFlow();
  });

  ipcMain.handle(IPC_CHANNELS.flowGetState, () => {
    return service.getState();
  });

  ipcMain.handle(IPC_CHANNELS.flowReset, () => {
    return service.resetState();
  });
}
