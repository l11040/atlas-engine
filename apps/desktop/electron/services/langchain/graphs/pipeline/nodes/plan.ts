// 책임: 요구사항과 위험 평가를 기반으로 실행 계획을 생성한다.

import type { PipelineStateType } from "../state";

// 목적: Phase 1에서 LLM을 사용하여 ExecutionPlan을 생성한다.
export async function plan(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  // TODO: Phase 1에서 구현
  return { executionPlan: state.executionPlan };
}
