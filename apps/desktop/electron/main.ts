import { app, BrowserWindow } from "electron";
import { registerCliIpc } from "./ipc/register-cli-ipc";
import { registerConfigIpc } from "./ipc/register-config-ipc";
import { registerFlowIpc } from "./ipc/register-flow-ipc";
import { loadSettings } from "./services/config/settings";
import { BackgroundFlowService } from "./services/flow/background-flow-service";
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

  const flowService = new BackgroundFlowService();
  // 목적: 디스크에서 상태 복원, running → interrupted 마킹
  await flowService.initialize();

  registerConfigIpc();
  registerCliIpc();
  registerFlowIpc(flowService);
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
