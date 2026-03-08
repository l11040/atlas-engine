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
  type FlowCancelRequest,
  type FlowInvokeRequest,
  type FlowInvokeResponse,
  type FlowState,
  type GitDiffRequest,
  type GitDiffResponse,
  type TodoFlowAllStatesResponse,
  type TodoFlowBackendState,
  type TodoFlowExecuteAllRequest,
  type TodoFlowStartRequest,
  type TodoFlowStartResponse
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
  getConfig(): Promise<AppSettings> {
    return ipcRenderer.invoke(IPC_CHANNELS.configGet);
  },
  updateConfig(request: AppSettingsUpdateRequest): Promise<AppSettings> {
    return ipcRenderer.invoke(IPC_CHANNELS.configUpdate, request);
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
  invokeFlow(request: FlowInvokeRequest): Promise<FlowInvokeResponse> {
    return ipcRenderer.invoke(IPC_CHANNELS.flowInvoke, request);
  },
  cancelFlow(request: FlowCancelRequest): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.flowCancel, request);
  },
  getFlowState(): Promise<FlowState> {
    return ipcRenderer.invoke(IPC_CHANNELS.flowGetState);
  },
  resetFlow(): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.flowReset);
  },
  startTodoFlow(request: TodoFlowStartRequest): Promise<TodoFlowStartResponse> {
    return ipcRenderer.invoke(IPC_CHANNELS.todoFlowStart, request);
  },
  getTodoFlowState(todoId: string): Promise<TodoFlowBackendState | null> {
    return ipcRenderer.invoke(IPC_CHANNELS.todoFlowGetState, todoId);
  },
  cancelTodoFlow(todoId: string): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.todoFlowCancel, todoId);
  },
  executeAllTodoFlows(request: TodoFlowExecuteAllRequest): Promise<{ status: string }> {
    return ipcRenderer.invoke(IPC_CHANNELS.todoFlowExecuteAll, request);
  },
  getAllTodoFlowStates(): Promise<TodoFlowAllStatesResponse> {
    return ipcRenderer.invoke(IPC_CHANNELS.todoFlowGetAllStates);
  }
};

contextBridge.exposeInMainWorld("atlas", api);
