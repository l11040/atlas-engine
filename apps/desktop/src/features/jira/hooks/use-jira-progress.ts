// 책임: Jira 티켓 수집 진행 이벤트를 구독하여 UI 상태로 관리한다.

import { useEffect, useState } from "react";
import type { JiraProgressEvent } from "@shared/ipc";

export interface JiraProgressState {
  active: boolean;
  key: string | null;
  collected: number;
  phase: "fetching" | "searching-children" | "completed" | "error" | null;
  message: string | null;
}

const INITIAL: JiraProgressState = {
  active: false,
  key: null,
  collected: 0,
  phase: null,
  message: null
};

export function useJiraProgress(): JiraProgressState {
  const [state, setState] = useState<JiraProgressState>(INITIAL);

  useEffect(() => {
    const unsub = window.atlas.onJiraProgress((event: JiraProgressEvent) => {
      if (event.phase === "completed") {
        setState({ active: false, key: null, collected: event.total, phase: "completed", message: `${event.total}개 이슈 수집 완료` });
        // 목적: 완료 후 3초 뒤 상태를 초기화한다.
        setTimeout(() => setState(INITIAL), 3000);
      } else if (event.phase === "error") {
        setState({ active: false, key: null, collected: 0, phase: "error", message: event.message });
        setTimeout(() => setState(INITIAL), 5000);
      } else {
        setState({
          active: true,
          key: event.key,
          collected: event.collected,
          phase: event.phase,
          message: null
        });
      }
    });

    return unsub;
  }, []);

  return state;
}
