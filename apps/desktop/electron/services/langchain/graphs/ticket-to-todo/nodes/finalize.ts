// 책임: 파이프라인 완료 노드. Todo 생성 단계의 정상 완료를 기록한다.

import { logEntry } from "../../shared/utils";
import type { TicketToTodoState } from "../state";

export function finalizeNode(_state: TicketToTodoState): Partial<TicketToTodoState> {
  return {
    phase: "plan",
    activityLog: [logEntry("파이프라인 완료 — Todo 생성 단계 완료", "success")]
  };
}
