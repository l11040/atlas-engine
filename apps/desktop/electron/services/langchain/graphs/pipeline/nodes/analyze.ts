// 책임: 티켓 Description을 구조화된 요구사항으로 파싱한다.

import type { PipelineStateType } from "../state";

// 목적: Phase 1에서 LLM을 사용하여 Description을 ParsedRequirements로 변환한다.
export async function analyze(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  // TODO: Phase 1에서 구현
  return { parsedRequirements: state.parsedRequirements };
}
