// 책임: Todo 실행 그래프를 조립하고 컴파일한다.
// 이유: v2.3 아키텍처의 workorder → explore → execute → verify → dod 플로우를 LangGraph로 구현한다.

import { END, StateGraph } from "@langchain/langgraph";
import type { CliLlm } from "../../cli-llm";
import { createComposeWorkorderNode } from "./nodes/compose-workorder";
import { createExploreNode } from "./nodes/explore";
import { createExecuteNode } from "./nodes/execute";
import { createVerifyNode } from "./nodes/verify";
import { dodCheckNode } from "./nodes/dod-check";
import { afterWorkorder, afterExplore, afterExecute, afterVerify } from "./routing";
import { TodoExecutionAnnotation } from "./state";

export type { TodoExecutionState } from "./state";
export type { Evidence, ContextPack, ImplReport } from "./state";

// 목적: startFromNode에 따라 진입점이 다른 그래프를 빌드한다.
// 이유: 재시도 시 특정 노드부터 재실행하여 LLM 호출 비용을 절약한다.
export function buildTodoExecutionGraph(llm: CliLlm, startFromNode?: string) {
  const graph = new StateGraph(TodoExecutionAnnotation)
    .addNode("compose_workorder", createComposeWorkorderNode(llm))
    .addNode("explore", createExploreNode(llm))
    .addNode("execute", createExecuteNode(llm))
    .addNode("verify", createVerifyNode(llm))
    .addNode("dod_check", dodCheckNode);

  // 목적: 지정된 시작 노드로 그래프 진입점을 설정한다.
  if (startFromNode === "explore") {
    graph.addEdge("__start__", "explore");
  } else if (startFromNode === "execute") {
    graph.addEdge("__start__", "execute");
  } else if (startFromNode === "verify") {
    graph.addEdge("__start__", "verify");
  } else {
    graph.addEdge("__start__", "compose_workorder");
  }

  graph.addConditionalEdges("compose_workorder", afterWorkorder);
  graph.addConditionalEdges("explore", afterExplore);
  graph.addConditionalEdges("execute", afterExecute);
  graph.addConditionalEdges("verify", afterVerify);
  graph.addEdge("dod_check", END);

  return graph.compile();
}
