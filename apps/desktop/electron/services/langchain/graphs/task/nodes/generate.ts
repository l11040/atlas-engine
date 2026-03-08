// 책임: CLI 에이전트에 코드 변경을 위임한다.

import type { TaskGraphStateType } from "../state";

// 목적: Phase 2에서 LLM(allowTools: true)을 사용하여 코드 변경을 생성한다.
export async function generate(state: TaskGraphStateType): Promise<Partial<TaskGraphStateType>> {
  // TODO: Phase 2에서 구현
  return { changeSets: state.changeSets };
}
