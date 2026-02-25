// 책임: Ticket → Todo 서브그래프의 조건부 라우팅을 정의한다.

import type { TicketToTodoState } from "./state";

export function afterDorFormal(state: TicketToTodoState): "dor_semantic" | "hold_end" {
  return state.dorFormalResult === "pass" ? "dor_semantic" : "hold_end";
}

export function afterDorSemantic(state: TicketToTodoState): "build_todos" | "hold_end" {
  return state.dorSemanticResult === "proceed" ? "build_todos" : "hold_end";
}

export function afterBuildTodos(state: TicketToTodoState): "finalize" | "hold_end" {
  return state.holdReason ? "hold_end" : "finalize";
}
