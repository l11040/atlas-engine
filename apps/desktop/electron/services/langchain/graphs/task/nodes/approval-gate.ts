// 책임: 승인 게이트를 처리한다. 자동 승인 또는 사람 개입 대기.

import type { TaskGraphStateType } from "../state";
import type { ApprovalRecord } from "../../../../../../shared/ipc";

// 목적: 현재는 자동 승인을 수행한다.
// TODO: Phase 3에서 human-in-the-loop 승인 대기를 구현한다.
//   - 상태를 "awaiting_approval"로 전환하고 외부 신호를 대기하는 interrupt 패턴 적용
//   - 위험도 높은 변경(scope_violations, risk_notes)은 자동 승인을 차단
export async function approvalGate(state: TaskGraphStateType): Promise<Partial<TaskGraphStateType>> {
  // 주의: scope_violations가 있으면 자동 승인하지 않고 거부한다.
  if (state.changeSets && state.changeSets.scope_violations.length > 0) {
    const approval: ApprovalRecord = {
      decision: "rejected",
      reason: `Scope violations detected: ${state.changeSets.scope_violations.join(", ")}`,
      decidedAt: Date.now(),
      decidedBy: "auto"
    };
    return { approval };
  }

  const approval: ApprovalRecord = {
    decision: "approved",
    reason: null,
    decidedAt: Date.now(),
    decidedBy: "auto"
  };

  return { approval };
}
