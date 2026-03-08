// 책임: 자동화 파이프라인 IPC 핸들러를 등록한다.

import { ipcMain } from "electron";
import { IPC_CHANNELS, type RunStartRequest, type RunCancelRequest, type TaskApprovalRequest } from "../../shared/ipc";
import {
  startRun,
  cancelRun,
  fetchRunState,
  resetRun,
  fetchTaskState,
  fetchAllTaskStates,
  cancelTask,
  handleTaskApproval
} from "../services/automation/automation-service";

export function registerAutomationIpc(): void {
  // 렌더러 → 메인: Run 실행 제어
  ipcMain.handle(IPC_CHANNELS.runStart, (_event, request: RunStartRequest) => startRun(request));
  ipcMain.handle(IPC_CHANNELS.runCancel, (_event, request: RunCancelRequest) => cancelRun(request));
  ipcMain.handle(IPC_CHANNELS.runGetState, () => fetchRunState());
  ipcMain.handle(IPC_CHANNELS.runReset, () => resetRun());

  // 렌더러 → 메인: Task 단위 제어 및 승인 게이트
  ipcMain.handle(IPC_CHANNELS.taskGetState, (_event, taskId: string) => fetchTaskState(taskId));
  ipcMain.handle(IPC_CHANNELS.taskGetAllStates, () => fetchAllTaskStates());
  ipcMain.handle(IPC_CHANNELS.taskCancel, (_event, taskId: string) => cancelTask(taskId));
  ipcMain.handle(IPC_CHANNELS.taskApprove, (_event, request: TaskApprovalRequest) => handleTaskApproval(request));
}
