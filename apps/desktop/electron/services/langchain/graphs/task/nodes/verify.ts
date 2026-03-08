// 책임: 검증 명령 실행 및 4가지 체크를 수행한다.

import type { TaskGraphStateType } from "../state";

// 목적: Phase 2에서 LLM(allowTools: true)을 사용하여 자동 검증을 수행한다.
export async function verify(state: TaskGraphStateType): Promise<Partial<TaskGraphStateType>> {
  // TODO: Phase 2에서 구현
  return { verification: state.verification };
}
