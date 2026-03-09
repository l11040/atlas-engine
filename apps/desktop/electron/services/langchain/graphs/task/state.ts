// 책임: 작업 실행 그래프(Task 단위)의 상태 모델을 정의한다.

import { Annotation } from "@langchain/langgraph";
import type {
  TaskUnit,
  ParsedRequirements,
  ChangeSet,
  ChangeExplanation,
  VerificationResult,
  ApprovalRecord
} from "../../../../../shared/ipc";

// 목적: LangGraph StateGraph에서 사용하는 작업 실행 상태 어노테이션.
export const TaskGraphState = Annotation.Root({
  task: Annotation<TaskUnit>,
  parsedRequirements: Annotation<ParsedRequirements | null>({
    reducer: (_prev, next) => next,
    default: () => null
  }),
  attempt: Annotation<{ current: number; max: number }>({
    reducer: (_prev, next) => next,
    default: () => ({ current: 0, max: 3 })
  }),
  changeSets: Annotation<ChangeSet | null>({
    reducer: (_prev, next) => next,
    default: () => null
  }),
  explanation: Annotation<ChangeExplanation | null>({
    reducer: (_prev, next) => next,
    default: () => null
  }),
  verification: Annotation<VerificationResult | null>({
    reducer: (_prev, next) => next,
    default: () => null
  }),
  postVerification: Annotation<VerificationResult | null>({
    reducer: (_prev, next) => next,
    default: () => null
  }),
  approval: Annotation<ApprovalRecord | null>({
    reducer: (_prev, next) => next,
    default: () => null
  }),
  error: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null
  })
});

export type TaskGraphStateType = typeof TaskGraphState.State;
