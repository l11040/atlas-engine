// 책임: 파이프라인 그래프(Run 수준)의 상태 모델을 정의한다.

import { Annotation } from "@langchain/langgraph";
import type {
  ParsedRequirements,
  RiskAssessment,
  ExecutionPlan
} from "../../../../../shared/ipc";

// 목적: LangGraph StateGraph에서 사용하는 파이프라인 상태 어노테이션.
export const PipelineState = Annotation.Root({
  ticketId: Annotation<string>,
  description: Annotation<string>,
  parsedRequirements: Annotation<ParsedRequirements | null>({
    reducer: (_prev, next) => next,
    default: () => null
  }),
  riskAssessment: Annotation<RiskAssessment | null>({
    reducer: (_prev, next) => next,
    default: () => null
  }),
  executionPlan: Annotation<ExecutionPlan | null>({
    reducer: (_prev, next) => next,
    default: () => null
  }),
  error: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null
  })
});

export type PipelineStateType = typeof PipelineState.State;
