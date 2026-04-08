// 책임: atlas_sessions 목록을 IPC로 조회하고 실시간 갱신을 관리한다.
import { useCallback, useEffect, useState } from "react";
import { useIpcEvent } from "@/hooks/use-ipc-event";
import type { HookLogEntry, SessionSummary } from "@shared/ipc";

export function useSessions() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const result = await window.atlas.querySessions();
    setSessions(result);
    setLoading(false);
  }, []);

  // 목적: 마운트 시 세션 목록을 1회 조회한다.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 목적: 새 로그 push 시 세션 목록을 갱신한다 (새 세션이 추가될 수 있으므로).
  useIpcEvent<HookLogEntry[]>(
    window.atlas.onLogNewEntries,
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  return { sessions, loading };
}
