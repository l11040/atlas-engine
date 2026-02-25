// 책임: DoR 형식 검증 노드. AC와 시나리오 존재 여부를 결정론적으로 확인한다.

import { logEntry } from "../../shared/utils";
import type { TicketToTodoState } from "../state";

export function dorFormalNode(state: TicketToTodoState): Partial<TicketToTodoState> {
  const { ticket } = state;

  if (!ticket.test_scenarios || ticket.test_scenarios.length === 0) {
    return {
      phase: "dor",
      dorFormalResult: "hold",
      dorFormalReason: "시나리오 섹션이 존재하지 않습니다",
      holdReason: "DoR 형식 검증 실패: 시나리오 섹션 없음",
      activityLog: [logEntry("DoR 형식 검증 실패 — 시나리오 섹션 없음", "error")]
    };
  }

  if (!ticket.acceptance_criteria || ticket.acceptance_criteria.length === 0) {
    return {
      phase: "dor",
      dorFormalResult: "hold",
      dorFormalReason: "Acceptance Criteria가 존재하지 않습니다",
      holdReason: "DoR 형식 검증 실패: AC 없음",
      activityLog: [logEntry("DoR 형식 검증 실패 — AC 없음", "error")]
    };
  }

  return {
    phase: "dor",
    dorFormalResult: "pass",
    dorFormalReason: `AC ${ticket.acceptance_criteria.length}개, 시나리오 ${ticket.test_scenarios.length}개 확인`,
    activityLog: [logEntry(`DoR 형식 검증 통과 — AC ${ticket.acceptance_criteria.length}개, 시나리오 ${ticket.test_scenarios.length}개`, "success")]
  };
}
