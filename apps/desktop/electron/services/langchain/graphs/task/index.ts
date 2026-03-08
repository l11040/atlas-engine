// 책임: 작업 실행 그래프를 빌드하여 export한다.

import { StateGraph } from "@langchain/langgraph";
import { TaskGraphState } from "./state";
import { generate } from "./nodes/generate";
import { explain } from "./nodes/explain";
import { verify } from "./nodes/verify";
import { evaluate } from "./nodes/evaluate";
import { revise } from "./nodes/revise";
import { approvalGate } from "./nodes/approval-gate";
import { apply } from "./nodes/apply";
import { postVerify } from "./nodes/post-verify";
import { routeAfterEvaluate, routeAfterApproval } from "./routing";

export function buildTaskGraph() {
  const graph = new StateGraph(TaskGraphState)
    .addNode("generate", generate)
    .addNode("explain", explain)
    .addNode("verify", verify)
    .addNode("evaluate", evaluate)
    .addNode("revise", revise)
    .addNode("approval_gate", approvalGate)
    .addNode("apply", apply)
    .addNode("post_verify", postVerify)
    .addEdge("__start__", "generate")
    .addEdge("generate", "explain")
    .addEdge("explain", "verify")
    .addEdge("verify", "evaluate")
    .addConditionalEdges("evaluate", routeAfterEvaluate)
    .addEdge("revise", "explain")
    .addConditionalEdges("approval_gate", routeAfterApproval)
    .addEdge("apply", "post_verify")
    .addEdge("post_verify", "__end__");

  return graph.compile();
}
