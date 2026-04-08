import { app, BrowserWindow } from "electron";
import { registerConfigIpc } from "./ipc/register-config-ipc";
import { registerLogIpc } from "./ipc/register-log-ipc";
import { registerPipelineIpc } from "./ipc/register-pipeline-ipc";
import { loadSettings } from "./services/config/settings";
import { closeAppDatabase } from "./services/storage/sqlite-db";
import { createMainWindow } from "./window/create-main-window";

process.on("uncaughtException", (error) => {
  console.error("[main] uncaughtException", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[main] unhandledRejection", reason);
});

// 목적: 설정 캐시를 워밍한 뒤 IPC 핸들러를 등록한다.
app.whenReady().then(async () => {
  await loadSettings();

  registerConfigIpc();
  registerLogIpc();
  registerPipelineIpc();
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
