import { ipcMain } from "electron";
import { IPC_CHANNELS, type AppSettingsUpdateRequest } from "../../shared/ipc";
import { getSettings, updateSettings } from "../services/config/settings";

export function registerConfigIpc() {
  // 목적: getSettings 서비스로 현재 설정값 조회를 위임한다.
  ipcMain.handle(IPC_CHANNELS.configGet, () => {
    try {
      return getSettings();
    } catch (error) {
      console.error("[ipc] config:get exception", error);
      throw error;
    }
  });

  // 목적: updateSettings 서비스로 부분 업데이트를 위임한다.
  ipcMain.handle(IPC_CHANNELS.configUpdate, (_event, request: AppSettingsUpdateRequest) => {
    try {
      return updateSettings(request.settings);
    } catch (error) {
      console.error("[ipc] config:update exception", error);
      throw error;
    }
  });
}
