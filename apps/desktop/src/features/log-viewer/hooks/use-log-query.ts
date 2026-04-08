// 책임: IPC를 통해 로그를 조회하고 실시간 업데이트를 구독한다.
import { useCallback, useEffect, useState } from "react";
import { useIpcEvent } from "@/hooks/use-ipc-event";
import type { HookLogEntry } from "@shared/ipc";

export function useLogQuery(sessionId: string | null) {
  const [logs, setLogs] = useState<HookLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setLogs([]);
      return;
    }
    setLoading(true);
    const result = await window.atlas.queryLogs({ sessionId });
    setLogs(result);
    setLoading(false);
  }, [sessionId]);

  // 목적: sessionId 변경 시 해당 세션의 로그를 조회한다.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 목적: 실시간 로그 push를 구독하여 현재 세션 엔트리를 추가하거나 갱신한다.
  // 이유: 에이전트 로그는 start 시 INSERT(running), stop 시 UPDATE(completed)되므로
  //       같은 id로 다시 오면 기존 항목을 교체해 상태를 최신으로 유지해야 한다.
  useIpcEvent<HookLogEntry[]>(
    window.atlas.onLogNewEntries,
    useCallback((entries) => {
      if (!sessionId) return;
      const relevant = entries.filter((e) => e.sessionId === sessionId);
      if (relevant.length > 0) {
        setLogs((prev) => {
          const byKey = new Map(prev.map((l) => [`${l.type}-${l.id}`, l]));
          for (const e of relevant) {
            byKey.set(`${e.type}-${e.id}`, e);
          }
          return [...byKey.values()].sort((a, b) =>
            (a.startTime ?? "").localeCompare(b.startTime ?? "")
          );
        });
      }
    }, [sessionId])
  );

  return { logs, loading };
}
