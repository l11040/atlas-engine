import { ipcMain } from "electron";
import { IPC_CHANNELS, type ClaudeAuthStatusRequest, type ClaudeCancelRequest, type ClaudeRunRequest } from "../../shared/ipc";
import { checkClaudeAuthStatus } from "../services/claude/auth";
import { cancelClaude, runClaude } from "../services/claude/runner";

export function registerClaudeIpc() {
  // 주의: 모든 IPC 핸들러는 예외를 로깅한 뒤 다시 throw 해서 렌더러에서도 감지 가능하게 유지한다.
  // 목적: runClaude 서비스로 프롬프트 실행을 위임한다.
  ipcMain.handle(IPC_CHANNELS.claudeRun, (event, request: ClaudeRunRequest) => {
    try {
      return runClaude(event.sender, request);
    } catch (error) {
      console.error("[ipc] claude:run exception", error);
      throw error;
    }
  });

  // 목적: cancelClaude 서비스로 실행 중인 프로세스 취소를 위임한다.
  ipcMain.handle(IPC_CHANNELS.claudeCancel, (event, request: ClaudeCancelRequest) => {
    try {
      return cancelClaude(event.sender, request);
    } catch (error) {
      console.error("[ipc] claude:cancel exception", error);
      throw error;
    }
  });

  // 목적: checkClaudeAuthStatus 서비스로 인증 상태 조회를 위임한다.
  ipcMain.handle(IPC_CHANNELS.claudeAuthStatus, (_event, request?: ClaudeAuthStatusRequest) => {
    try {
      return checkClaudeAuthStatus(request);
    } catch (error) {
      console.error("[ipc] claude:auth-status exception", error);
      throw error;
    }
  });
}
