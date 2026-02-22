import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type AppSettings,
  type AppSettingsUpdateRequest,
  type AtlasDesktopApi,
  type ClaudeAuthStatusRequest,
  type ClaudeAuthStatusResponse,
  type ClaudeCancelRequest,
  type ClaudeCancelResponse,
  type ClaudeEvent,
  type ClaudeRunRequest,
  type ClaudeRunResponse,
  type GitDiffRequest,
  type GitDiffResponse
} from "../shared/ipc";

const api: AtlasDesktopApi = {
  runClaude(request: ClaudeRunRequest): Promise<ClaudeRunResponse> {
    return ipcRenderer.invoke(IPC_CHANNELS.claudeRun, request);
  },
  cancelClaude(request: ClaudeCancelRequest): Promise<ClaudeCancelResponse> {
    return ipcRenderer.invoke(IPC_CHANNELS.claudeCancel, request);
  },
  getClaudeAuthStatus(request?: ClaudeAuthStatusRequest): Promise<ClaudeAuthStatusResponse> {
    return ipcRenderer.invoke(IPC_CHANNELS.claudeAuthStatus, request);
  },
  getGitDiff(request: GitDiffRequest): Promise<GitDiffResponse> {
    return ipcRenderer.invoke(IPC_CHANNELS.claudeGitDiff, request);
  },
  getConfig(): Promise<AppSettings> {
    return ipcRenderer.invoke(IPC_CHANNELS.configGet);
  },
  updateConfig(request: AppSettingsUpdateRequest): Promise<AppSettings> {
    return ipcRenderer.invoke(IPC_CHANNELS.configUpdate, request);
  },
  onClaudeEvent(listener: (event: ClaudeEvent) => void) {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: ClaudeEvent) => {
      listener(payload);
    };

    ipcRenderer.on(IPC_CHANNELS.claudeEvent, wrapped);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.claudeEvent, wrapped);
    };
  }
};

contextBridge.exposeInMainWorld("atlas", api);
