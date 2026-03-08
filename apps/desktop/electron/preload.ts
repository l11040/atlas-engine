import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type AppSettings,
  type AppSettingsUpdateRequest,
  type AtlasDesktopApi,
  type CliAuthCheckRequest,
  type CliAuthStatusResponse,
  type CliCancelRequest,
  type CliCancelResponse,
  type CliEvent,
  type CliRunRequest,
  type CliRunResponse,
  type GitDiffRequest,
  type GitDiffResponse,
  type JiraFetchTicketTreeRequest,
  type JiraFetchTicketTreeResponse,
  type JiraProgressEvent,
  type JiraTestConnectionRequest,
  type JiraTestConnectionResponse,
  type JiraTicketTree,
  type RunCancelRequest,
  type RunStartRequest,
  type RunStartResponse,
  type RunState,
  type TaskApprovalRequest,
  type TaskExecutionState
} from "../shared/ipc";

const api: AtlasDesktopApi = {
  runCli(request: CliRunRequest): Promise<CliRunResponse> {
    return ipcRenderer.invoke(IPC_CHANNELS.cliRun, request);
  },
  cancelCli(request: CliCancelRequest): Promise<CliCancelResponse> {
    return ipcRenderer.invoke(IPC_CHANNELS.cliCancel, request);
  },
  getCliAuthStatus(request: CliAuthCheckRequest): Promise<CliAuthStatusResponse> {
    return ipcRenderer.invoke(IPC_CHANNELS.cliAuthStatus, request);
  },
  getGitDiff(request: GitDiffRequest): Promise<GitDiffResponse> {
    return ipcRenderer.invoke(IPC_CHANNELS.gitDiff, request);
  },
  onCliEvent(listener: (event: CliEvent) => void) {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: CliEvent) => {
      listener(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.cliEvent, wrapped);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.cliEvent, wrapped);
    };
  },
  // 자동화 파이프라인
  startRun(request: RunStartRequest): Promise<RunStartResponse> {
    return ipcRenderer.invoke(IPC_CHANNELS.runStart, request);
  },
  cancelRun(request: RunCancelRequest): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.runCancel, request);
  },
  getRunState(): Promise<RunState | null> {
    return ipcRenderer.invoke(IPC_CHANNELS.runGetState);
  },
  resetRun(): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.runReset);
  },
  getTaskState(taskId: string): Promise<TaskExecutionState | null> {
    return ipcRenderer.invoke(IPC_CHANNELS.taskGetState, taskId);
  },
  getAllTaskStates(): Promise<Record<string, TaskExecutionState>> {
    return ipcRenderer.invoke(IPC_CHANNELS.taskGetAllStates);
  },
  cancelTask(taskId: string): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.taskCancel, taskId);
  },
  approveTask(request: TaskApprovalRequest): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.taskApprove, request);
  },
  // 설정
  getConfig(): Promise<AppSettings> {
    return ipcRenderer.invoke(IPC_CHANNELS.configGet);
  },
  updateConfig(request: AppSettingsUpdateRequest): Promise<AppSettings> {
    return ipcRenderer.invoke(IPC_CHANNELS.configUpdate, request);
  },
  // Jira
  testJiraConnection(request: JiraTestConnectionRequest): Promise<JiraTestConnectionResponse> {
    return ipcRenderer.invoke(IPC_CHANNELS.jiraTestConnection, request);
  },
  fetchJiraTicketTree(request: JiraFetchTicketTreeRequest): Promise<JiraFetchTicketTreeResponse> {
    return ipcRenderer.invoke(IPC_CHANNELS.jiraFetchTicketTree, request);
  },
  getJiraTicketTree(rootKey: string): Promise<JiraTicketTree | null> {
    return ipcRenderer.invoke(IPC_CHANNELS.jiraGetTicketTree, rootKey);
  },
  getAllJiraTicketTrees(): Promise<JiraTicketTree[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.jiraGetAllTicketTrees);
  },
  onJiraProgress(listener: (event: JiraProgressEvent) => void) {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: JiraProgressEvent) => {
      listener(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.jiraProgress, wrapped);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.jiraProgress, wrapped);
    };
  }
};

contextBridge.exposeInMainWorld("atlas", api);
