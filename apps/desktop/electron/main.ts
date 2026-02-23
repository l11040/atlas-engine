import { app, BrowserWindow } from "electron";
import { registerCliIpc } from "./ipc/register-cli-ipc";
import { registerConfigIpc } from "./ipc/register-config-ipc";
import { loadSettings } from "./services/config/settings";
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
  registerCliIpc();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
