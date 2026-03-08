// 책임: 검증 결과와 시도 횟수로 다음 분기를 결정한다.

import type { TaskGraphStateType } from "../state";

// 목적: 결정적 노드. LLM 없이 검증 결과를 평가하여 상태를 갱신한다.
// 이유: 라우팅은 routeAfterEvaluate가 담당하므로, 이 노드는 실패 시 에러 상태만 설정한다.
export async function evaluate(state: TaskGraphStateType): Promise<Partial<TaskGraphStateType>> {
  const { verification, attempt } = state;

  // 목적: 검증 통과 시 상태 변경 없이 라우팅에 위임한다.
  if (verification?.verdict === "pass") {
    return {};
  }

  // 목적: 최대 시도 횟수 도달 시 에러를 설정하여 종료 조건을 알린다.
  if (attempt.current >= attempt.max) {
    const reasons = verification?.failure_reasons.join("; ") ?? "unknown";
    return {
      error: `최대 시도 횟수(${attempt.max}) 초과. 마지막 실패 사유: ${reasons}`
    };
  }

  // 목적: 재시도 가능 상태에서는 상태 변경 없이 revise로 라우팅된다.
  return {};
}
