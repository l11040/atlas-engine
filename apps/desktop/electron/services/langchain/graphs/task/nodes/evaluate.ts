// 책임: 검증 결과와 시도 횟수로 다음 분기를 결정한다.

import type { TaskGraphStateType } from "../state";

// 목적: 결정적 노드. 검증 결과를 평가하여 라우팅 정보를 상태에 반영한다.
export async function evaluate(state: TaskGraphStateType): Promise<Partial<TaskGraphStateType>> {
  // TODO: Phase 2에서 구현 (routeAfterEvaluate와 연동)
  return {};
}
