import { app, BrowserWindow } from "electron";
import { registerCliIpc } from "./ipc/register-cli-ipc";
import { registerConfigIpc } from "./ipc/register-config-ipc";
import { registerFlowIpc } from "./ipc/register-flow-ipc";
import { registerJiraIpc } from "./ipc/register-jira-ipc";
import { registerTodoFlowIpc } from "./ipc/register-todo-flow-ipc";
import { loadSettings } from "./services/config/settings";
import { BackgroundFlowService } from "./services/flow/background-flow-service";
import { TodoFlowService } from "./services/flow/todo-flow-service";
import { closeAppDatabase } from "./services/storage/sqlite-db";
import { createMainWindow } from "./window/create-main-window";

process.on("uncaughtException", (error) => {
  console.error("[main] uncaughtException", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[main] unhandledRejection", reason);
});

// 목적: 설정 캐시를 워밍한 뒤 BackgroundFlowService를 초기화하고 IPC 핸들러를 등록한다.
app.whenReady().then(async () => {
  await loadSettings();

  const todoFlowService = new TodoFlowService();
  // 목적: 디스크에서 Todo 실행 상태 복원, running → interrupted 마킹
  await todoFlowService.initialize();

  const flowService = new BackgroundFlowService();
  // 목적: ticket-to-todo 완료 후 자동 todo execution을 위해 TodoFlowService 연결
  flowService.setTodoFlowService(todoFlowService);
  // 목적: 디스크에서 상태 복원, running → interrupted 마킹
  await flowService.initialize();

  registerConfigIpc();
  registerCliIpc();
  registerJiraIpc();
  registerFlowIpc(flowService);
  registerTodoFlowIpc(todoFlowService);
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  closeAppDatabase();
});
