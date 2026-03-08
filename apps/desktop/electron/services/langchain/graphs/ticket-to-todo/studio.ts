// 책임: LangGraph Studio용 그래프 진입점. langgraph dev 서버가 이 모듈을 로드한다.
// 이유: Studio에서는 dor·plan 서브그래프 계층으로 시각화하고, 런타임은 flat 구조를 사용한다.

import { END, StateGraph } from "@langchain/langgraph";
import { CliLlm } from "../../cli-llm";
import { holdEndNode } from "./nodes/hold-end";
import { TicketToTodoAnnotation, type TicketToTodoState } from "./state";
import { buildDorSubgraph } from "./subgraphs/dor";
import { buildPlanSubgraph } from "./subgraphs/plan";
import type { ProviderType } from "../../../../../shared/ipc";

// 목적: 환경 변수 또는 기본값으로 CliLlm을 구성한다.
const llm = new CliLlm({
  provider: (process.env.ATLAS_PROVIDER as ProviderType) || "claude",
  cwd: process.env.ATLAS_CWD || process.cwd(),
  permissionMode: "auto",
  timeoutMs: 300_000
});

function afterDor(state: TicketToTodoState): "plan" | "hold_end" {
  if (state.dorFormalResult === "hold" || state.dorSemanticResult === "hold") {
    return "hold_end";
  }
  return "plan";
}

function afterPlan(state: TicketToTodoState): "__end__" | "hold_end" {
  return state.holdReason ? "hold_end" : "__end__";
}

// 목적: Studio용 서브그래프 기반 메인 그래프를 빌드한다.
const studioGraph = new StateGraph(TicketToTodoAnnotation)
  .addNode("dor", buildDorSubgraph(llm))
  .addNode("plan", buildPlanSubgraph(llm))
  .addNode("hold_end", holdEndNode);

studioGraph.addEdge("__start__", "dor");
studioGraph.addConditionalEdges("dor", afterDor);
studioGraph.addConditionalEdges("plan", afterPlan);
studioGraph.addEdge("hold_end", END);

export const graph = studioGraph.compile();
