// 책임: 파이프라인 그래프를 빌드하여 export한다.

import { StateGraph } from "@langchain/langgraph";
import { PipelineState } from "./state";
import { ingest } from "./nodes/ingest";
import { analyze } from "./nodes/analyze";
import { assessRisk } from "./nodes/assess-risk";
import { plan } from "./nodes/plan";
import { routeAfterAnalyze, routeAfterRisk, routeAfterPlan } from "./routing";

export function buildPipelineGraph() {
  const graph = new StateGraph(PipelineState)
    .addNode("ingest", ingest)
    .addNode("analyze", analyze)
    .addNode("assess_risk", assessRisk)
    .addNode("plan", plan)
    .addEdge("__start__", "ingest")
    .addEdge("ingest", "analyze")
    .addConditionalEdges("analyze", routeAfterAnalyze)
    .addConditionalEdges("assess_risk", routeAfterRisk)
    .addConditionalEdges("plan", routeAfterPlan);

  return graph.compile();
}
