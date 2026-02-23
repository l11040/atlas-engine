// 책임: 앱 설정 상태 관리 및 IPC를 통한 조회·수정을 관리한다.
import { useCallback, useEffect, useState } from "react";
import type { AppSettings, DeepPartial } from "@shared/ipc";

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // 목적: 마운트 시 메인 프로세스에서 현재 설정을 1회 로드한다.
  useEffect(() => {
    window.atlas.getConfig().then((config) => {
      setSettings(config);
      setLoading(false);
    });
  }, []);

  const saveConfig = useCallback(async (partial: DeepPartial<AppSettings>) => {
    const updated = await window.atlas.updateConfig({ settings: partial });
    setSettings(updated);
    return updated;
  }, []);

  return { settings, loading, saveConfig };
}
