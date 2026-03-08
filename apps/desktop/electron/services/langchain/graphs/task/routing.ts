// 책임: 작업 실행 그래프의 조건부 라우팅을 정의한다.

import type { TaskGraphStateType } from "./state";

// 목적: evaluate 노드 이후 검증 결과와 시도 횟수로 분기한다.
export function routeAfterEvaluate(
  state: TaskGraphStateType
): "approval_gate" | "revise" | "__end__" {
  if (state.verification?.verdict === "pass") {
    return "approval_gate";
  }
  if (state.attempt.current < state.attempt.max) {
    return "revise";
  }
  // 주의: 최대 시도 횟수 초과 시 HIL 에스컬레이션을 위해 종료한다.
  return "__end__";
}

// 목적: approval_gate 이후 결과로 분기한다.
export function routeAfterApproval(
  state: TaskGraphStateType
): "apply" | "__end__" {
  if (state.approval?.decision === "approved") {
    return "apply";
  }
  return "__end__";
}
