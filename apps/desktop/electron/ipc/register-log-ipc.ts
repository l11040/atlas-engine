// 책임: 로그 감시 및 조회 IPC 핸들러를 등록한다.

import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/ipc";
import type { LogQueryRequest } from "../../shared/ipc";
import { startLogWatcher, stopLogWatcher } from "../services/log-watcher/log-watcher-service";
import { queryAllLogs, querySessions } from "../services/log-watcher/log-query-service";

export function registerLogIpc(): void {
  // 목적: logWatcherStart → 지정 cwd에서 JSONL 감시를 시작한다.
  ipcMain.handle(IPC_CHANNELS.logWatcherStart, (_event, cwd: string) => {
    startLogWatcher(cwd);
  });

  // 목적: logWatcherStop → 감시를 중지한다.
  ipcMain.handle(IPC_CHANNELS.logWatcherStop, () => {
    stopLogWatcher();
  });

  // 목적: logQuery → 로그 조회 또는 세션 목록 조회를 위임한다.
  ipcMain.handle(IPC_CHANNELS.logQuery, (_event, request: LogQueryRequest & { type?: string }) => {
    if ((request as { type?: string }).type === "sessions") {
      return querySessions();
    }
    return queryAllLogs(request);
  });
}
