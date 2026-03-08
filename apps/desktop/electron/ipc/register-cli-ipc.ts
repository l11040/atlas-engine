// 책임: provider-agnostic CLI IPC 핸들러를 등록한다.

import { ipcMain } from "electron";
import {
  IPC_CHANNELS,
  type CliAuthCheckRequest,
  type CliCancelRequest,
  type CliEvent,
  type CliRunRequest,
  type GitDiffRequest
} from "../../shared/ipc";
import { getProvider } from "../services/providers/registry";
import { getGitDiff } from "../services/git/diff";

// 목적: IPC 이벤트를 호출한 렌더러(webContents)로만 되돌려준다.
function emitCliEvent(target: Electron.WebContents, event: CliEvent) {
  if (target.isDestroyed()) return;
  target.send(IPC_CHANNELS.cliEvent, event);
}

export function registerCliIpc() {
  // 주의: 모든 IPC 핸들러는 예외를 로깅한 뒤 다시 throw 해서 렌더러에서도 감지 가능하게 유지한다.

  // 목적: provider를 조회하여 CLI 실행을 위임한다.
  ipcMain.handle(IPC_CHANNELS.cliRun, (event, request: CliRunRequest) => {
    try {
      const provider = getProvider(request.provider);
      return provider.run(event.sender, request, emitCliEvent);
    } catch (error) {
      console.error("[ipc] cli:run exception", error);
      throw error;
    }
  });

  // 목적: 실행 중인 CLI 프로세스 취소를 위임한다.
  ipcMain.handle(IPC_CHANNELS.cliCancel, (event, request: CliCancelRequest) => {
    try {
      // 이유: cancel 요청에는 provider 정보가 없으므로 모든 provider에 시도한다.
      // 각 provider는 requestId가 없으면 not_found를 반환한다.
      let cancelled = false;
      for (const type of ["claude", "codex"] as const) {
        const provider = getProvider(type);
        const result = provider.cancel(event.sender, request, emitCliEvent);
        if (result.status === "cancelled") cancelled = true;
      }
      return cancelled
        ? { status: "cancelled" as const, requestId: request.requestId }
        : { status: "not_found" as const, requestId: request.requestId };
    } catch (error) {
      console.error("[ipc] cli:cancel exception", error);
      throw error;
    }
  });

  // 목적: 지정된 provider의 인증 상태 조회를 위임한다.
  ipcMain.handle(IPC_CHANNELS.cliAuthStatus, (_event, request: CliAuthCheckRequest) => {
    try {
      const provider = getProvider(request.provider);
      return provider.checkAuth(request);
    } catch (error) {
      console.error("[ipc] cli:auth-status exception", error);
      throw error;
    }
  });

  // 목적: getGitDiff 서비스로 git diff 조회를 위임한다. provider와 무관.
  ipcMain.handle(IPC_CHANNELS.gitDiff, (_event, request: GitDiffRequest) => {
    try {
      return getGitDiff(request.cwd, request.paths);
    } catch (error) {
      console.error("[ipc] git:diff exception", error);
      throw error;
    }
  });
}
