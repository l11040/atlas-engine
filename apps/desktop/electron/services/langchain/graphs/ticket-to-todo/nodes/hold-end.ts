// 책임: Hold 종료 노드. 파이프라인이 hold 상태로 종료됨을 기록한다.

import { logEntry } from "../../shared/utils";
import type { TicketToTodoState } from "../state";

export function holdEndNode(state: TicketToTodoState): Partial<TicketToTodoState> {
  return {
    phase: "hold",
    activityLog: [logEntry(`파이프라인 hold — ${state.holdReason}`, "warning")]
  };
}
