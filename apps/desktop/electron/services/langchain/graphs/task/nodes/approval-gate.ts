// 책임: 승인 게이트를 처리한다. 자동 승인 또는 사람 개입 대기.

import type { TaskGraphStateType } from "../state";

// 목적: Phase 3에서 autoApprove 조건 검사 및 승인 대기 상태 전환을 구현한다.
export async function approvalGate(state: TaskGraphStateType): Promise<Partial<TaskGraphStateType>> {
  // TODO: Phase 3에서 구현
  return { approval: state.approval };
}
