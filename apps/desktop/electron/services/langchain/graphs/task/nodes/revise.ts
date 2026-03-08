// 책임: 실패 사유 기반으로 코드를 수정한다.

import type { TaskGraphStateType } from "../state";

// 목적: Phase 2에서 LLM(allowTools: true)을 사용하여 failure_reasons 기반 수정을 수행한다.
export async function revise(state: TaskGraphStateType): Promise<Partial<TaskGraphStateType>> {
  // TODO: Phase 2에서 구현
  return {
    changeSets: state.changeSets,
    attempt: { current: state.attempt.current + 1, max: state.attempt.max }
  };
}
