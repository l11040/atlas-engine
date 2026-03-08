// 책임: Ticket → Todo 그래프를 조립하고 컴파일한다 (런타임용 flat 구조).
// 이유: flat 구조여야 각 노드가 즉시 emit되어 UI에서 실시간 phase 추적이 가능하다.

import { END, StateGraph } from "@langchain/langgraph";
import type { CliLlm } from "../../cli-llm";
import { dorFormalNode } from "./nodes/dor-formal";
import { createDorSemanticNode } from "./nodes/dor-semantic";
import { createBuildTodosNode } from "./nodes/build-todos";
import { finalizeNode } from "./nodes/finalize";
import { holdEndNode } from "./nodes/hold-end";
import { afterDorFormal, afterDorSemantic, afterBuildTodos } from "./routing";
import { TicketToTodoAnnotation } from "./state";

export type { TicketToTodoState } from "./state";

// 목적: startFromNode에 따라 진입점이 다른 그래프를 빌드한다.
// 이유: 전체 재실행 없이 특정 노드부터 재실행하여 LLM 호출 비용을 절약한다.
export function buildTicketToTodoGraph(llm: CliLlm, startFromNode?: string) {
  const graph = new StateGraph(TicketToTodoAnnotation)
    .addNode("dor_formal", dorFormalNode)
    .addNode("dor_semantic", createDorSemanticNode(llm))
    .addNode("build_todos", createBuildTodosNode(llm))
    .addNode("finalize", finalizeNode)
    .addNode("hold_end", holdEndNode);

  // 목적: 지정된 시작 노드로 그래프 진입점을 설정한다.
  if (startFromNode === "dor_semantic") {
    graph.addEdge("__start__", "dor_semantic");
  } else if (startFromNode === "build_todos") {
    graph.addEdge("__start__", "build_todos");
  } else {
    graph.addEdge("__start__", "dor_formal");
  }

  graph.addConditionalEdges("dor_formal", afterDorFormal);
  graph.addConditionalEdges("dor_semantic", afterDorSemantic);
  graph.addConditionalEdges("build_todos", afterBuildTodos);
  graph.addEdge("finalize", END);
  graph.addEdge("hold_end", END);

  return graph.compile();
}
