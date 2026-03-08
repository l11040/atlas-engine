// 책임: 변경 이유, AC 대응 관계, 위험 노트를 생성한다.

import type { TaskGraphStateType } from "../state";

// 목적: Phase 2에서 LLM(allowTools: false)을 사용하여 변경 설명을 생성한다.
export async function explain(state: TaskGraphStateType): Promise<Partial<TaskGraphStateType>> {
  // TODO: Phase 2에서 구현
  return { explanation: state.explanation };
}
