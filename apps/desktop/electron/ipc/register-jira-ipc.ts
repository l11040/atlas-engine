// 책임: Jira 관련 IPC 핸들러를 등록한다.

import { ipcMain, type IpcMainInvokeEvent } from "electron";
import {
  IPC_CHANNELS,
  type JiraTestConnectionRequest,
  type JiraTestConnectionResponse,
  type JiraFetchTicketTreeRequest,
  type JiraFetchTicketTreeResponse
} from "../../shared/ipc";
import { getSettings } from "../services/config/settings";
import { testConnection, fetchTicketTree } from "../services/jira/jira-client";
import { saveTicketTree, loadTicketTree } from "../services/jira/jira-ticket-store";

export function registerJiraIpc(): void {
  // 목적: 전달받은 자격증명으로 Jira 연결 테스트를 수행한다.
  ipcMain.handle(
    IPC_CHANNELS.jiraTestConnection,
    async (_event, request: JiraTestConnectionRequest): Promise<JiraTestConnectionResponse> => {
      try {
        const result = await testConnection(request);
        return { success: true, message: `연결 성공: ${result.displayName}`, displayName: result.displayName };
      } catch (error) {
        return { success: false, message: (error as Error).message };
      }
    }
  );

  // 목적: SQLite에서 저장된 티켓 트리를 반환한다.
  ipcMain.handle(IPC_CHANNELS.jiraGetTicketTree, () => loadTicketTree());

  // 목적: 저장된 Jira 설정으로 티켓 트리를 조회하고, 결과를 SQLite에 저장한다.
  ipcMain.handle(
    IPC_CHANNELS.jiraFetchTicketTree,
    async (event: IpcMainInvokeEvent, request: JiraFetchTicketTreeRequest): Promise<JiraFetchTicketTreeResponse> => {
      const settings = getSettings();
      if (!settings.jira?.baseUrl || !settings.jira?.email || !settings.jira?.apiToken) {
        return { success: false, message: "Jira 설정이 완료되지 않았습니다. 설정에서 Jira 연결 정보를 입력하세요." };
      }

      // 목적: event.sender로 진행 이벤트를 렌더러에 push한다.
      const sender = event.sender;

      try {
        const tree = await fetchTicketTree(settings.jira, request.ticketKey, sender);
        if (tree.total === 0) {
          return { success: false, message: `이슈 ${request.ticketKey}를 찾을 수 없습니다` };
        }

        // 목적: 조회된 티켓 트리를 전용 SQLite 테이블에 저장한다.
        saveTicketTree(tree);

        return { success: true, message: `${tree.total}개 이슈 조회 완료`, tree };
      } catch (error) {
        return { success: false, message: (error as Error).message };
      }
    }
  );
}
