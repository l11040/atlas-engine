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
  type HookLogEntry,
  type LogQueryRequest,
  type PipelineDefinition,
  type SessionSummary
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
  // 설정
  getConfig(): Promise<AppSettings> {
    return ipcRenderer.invoke(IPC_CHANNELS.configGet);
  },
  updateConfig(request: AppSettingsUpdateRequest): Promise<AppSettings> {
    return ipcRenderer.invoke(IPC_CHANNELS.configUpdate, request);
  },
  // 로그
  startLogWatcher(cwd: string): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.logWatcherStart, cwd);
  },
  stopLogWatcher(): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.logWatcherStop);
  },
  queryLogs(request: LogQueryRequest): Promise<HookLogEntry[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.logQuery, request);
  },
  querySessions(): Promise<SessionSummary[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.logQuery, { type: "sessions" });
  },
  onLogNewEntries(listener: (entries: HookLogEntry[]) => void) {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: HookLogEntry[]) => {
      listener(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.logNewEntries, wrapped);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.logNewEntries, wrapped);
    };
  },
  // 파이프라인
  getPipeline(id: string): Promise<PipelineDefinition | null> {
    return ipcRenderer.invoke(IPC_CHANNELS.pipelineGet, id);
  },
  savePipeline(definition: PipelineDefinition): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.pipelineSave, definition);
  },
  importPipeline(): Promise<PipelineDefinition | null> {
    return ipcRenderer.invoke(IPC_CHANNELS.pipelineImport);
  },
  listPipelines(): Promise<Array<{ id: string; name: string }>> {
    return ipcRenderer.invoke(IPC_CHANNELS.pipelineList);
  }
};

contextBridge.exposeInMainWorld("atlas", api);
