// 책임: 파이프라인 그래프를 빌드하여 export한다.

import { StateGraph } from "@langchain/langgraph";
import { PipelineState } from "./state";
import { ingest } from "./nodes/ingest";
import { analyze } from "./nodes/analyze";
import { assessRisk } from "./nodes/assess-risk";
import { plan } from "./nodes/plan";
import { routeAfterAnalyze, routeAfterRisk, routeAfterPlan } from "./routing";

// 목적: startNode에 해당하는 파이프라인 노드부터 실행하는 그래프를 빌드한다.
// 이유: 이전 Run 결과가 있을 때 특정 단계부터 재실행할 수 있게 한다.
export type PipelineEntryNode = "ingest" | "analyze" | "assess_risk" | "plan";

export function buildPipelineGraph(startNode: PipelineEntryNode = "ingest") {
  const graph = new StateGraph(PipelineState)
    .addNode("ingest", ingest)
    .addNode("analyze", analyze)
    .addNode("assess_risk", assessRisk)
    .addNode("plan", plan);

  // 목적: startNode에 따라 진입 엣지를 다르게 연결한다.
  const nodeOrder: PipelineEntryNode[] = ["ingest", "analyze", "assess_risk", "plan"];
  const startIdx = nodeOrder.indexOf(startNode);

  graph.addEdge("__start__", startNode);

  if (startIdx <= 0) graph.addEdge("ingest", "analyze");
  if (startIdx <= 1) graph.addConditionalEdges("analyze", routeAfterAnalyze);
  if (startIdx <= 2) graph.addConditionalEdges("assess_risk", routeAfterRisk);
  graph.addConditionalEdges("plan", routeAfterPlan);

  return graph.compile();
}
