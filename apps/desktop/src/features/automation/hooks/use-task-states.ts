// 책임: 모든 TaskExecutionState를 주기적으로 폴링하여 최신 상태를 제공한다.

import { useCallback, useEffect, useRef, useState } from "react";
import type { TaskExecutionState } from "@shared/ipc";

const POLL_INTERVAL_MS = 1_000;

export function useTaskStates() {
  const [taskStates, setTaskStates] = useState<Record<string, TaskExecutionState>>({});
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    try {
      const states = await window.atlas.getAllTaskStates();
      setTaskStates(states);
    } finally {
      setLoading(false);
    }
  }, []);

  // 목적: 마운트 시 즉시 조회 후 주기적 폴링을 시작한다.
  useEffect(() => {
    fetch();
    timerRef.current = setInterval(fetch, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetch]);

  return { taskStates, loading };
}
