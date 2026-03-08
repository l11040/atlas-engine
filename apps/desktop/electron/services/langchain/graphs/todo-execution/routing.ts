// 책임: Todo 실행 그래프의 조건부 라우팅을 정의한다.

import type { TodoExecutionState } from "./state";

// 목적: workorder 단계 후 에러 여부에 따라 분기한다.
export function afterWorkorder(state: TodoExecutionState): "explore" | "dod_check" {
  return state.error ? "dod_check" : "explore";
}

// 목적: explore 단계 후 에러 여부에 따라 분기한다.
export function afterExplore(state: TodoExecutionState): "execute" | "dod_check" {
  return state.error ? "dod_check" : "execute";
}

// 목적: execute 단계 후 에러 여부에 따라 분기한다.
export function afterExecute(state: TodoExecutionState): "verify" | "dod_check" {
  return state.error ? "dod_check" : "verify";
}

// 목적: verify 단계 후 항상 dod_check로 진행한다.
export function afterVerify(_state: TodoExecutionState): "dod_check" {
  return "dod_check";
}
