// 책임: DoR(Definition of Ready) 서브그래프. 형식 검증 → 의미 검증 순서로 티켓 품질을 평가한다.

import { END, StateGraph } from "@langchain/langgraph";
import type { CliLlm } from "../../../cli-llm";
import { dorFormalNode } from "../nodes/dor-formal";
import { createDorSemanticNode } from "../nodes/dor-semantic";
import { TicketToTodoAnnotation, type TicketToTodoState } from "../state";

// 목적: dor_formal hold 시 dor_semantic을 건너뛰고 서브그래프를 종료한다.
function afterDorFormal(state: TicketToTodoState): "dor_semantic" | "__end__" {
  return state.dorFormalResult === "pass" ? "dor_semantic" : "__end__";
}

// 목적: startFromNode에 따라 진입점이 다른 DoR 서브그래프를 빌드한다.
export function buildDorSubgraph(llm: CliLlm, startFromNode?: string) {
  // 주의: 모든 노드를 항상 등록해야 TypeScript 타입 추론이 동작한다.
  const graph = new StateGraph(TicketToTodoAnnotation)
    .addNode("dor_formal", dorFormalNode)
    .addNode("dor_semantic", createDorSemanticNode(llm));

  if (startFromNode === "dor_semantic") {
    // 이유: dor_formal 결과가 이미 주입된 상태로 dor_semantic만 실행한다.
    graph.addEdge("__start__", "dor_semantic");
  } else {
    graph.addEdge("__start__", "dor_formal");
    graph.addConditionalEdges("dor_formal", afterDorFormal);
  }

  graph.addEdge("dor_semantic", END);
  return graph.compile();
}
