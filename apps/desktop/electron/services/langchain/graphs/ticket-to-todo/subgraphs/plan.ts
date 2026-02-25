// 책임: Plan 서브그래프. AC↔시나리오 매핑 기반 Todo 생성 → 완료 처리를 수행한다.

import { END, StateGraph } from "@langchain/langgraph";
import type { CliLlm } from "../../../cli-llm";
import { createBuildTodosNode } from "../nodes/build-todos";
import { finalizeNode } from "../nodes/finalize";
import { TicketToTodoAnnotation, type TicketToTodoState } from "../state";

// 목적: build_todos hold 시 finalize를 건너뛰고 서브그래프를 종료한다.
function afterBuildTodos(state: TicketToTodoState): "finalize" | "__end__" {
  return state.holdReason ? "__end__" : "finalize";
}

export function buildPlanSubgraph(llm: CliLlm) {
  const graph = new StateGraph(TicketToTodoAnnotation)
    .addNode("build_todos", createBuildTodosNode(llm))
    .addNode("finalize", finalizeNode);

  graph.addEdge("__start__", "build_todos");
  graph.addConditionalEdges("build_todos", afterBuildTodos);
  graph.addEdge("finalize", END);

  return graph.compile();
}
