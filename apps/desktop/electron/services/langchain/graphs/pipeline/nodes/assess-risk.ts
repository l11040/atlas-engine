// 책임: 변경 범위·복잡도·회귀 위험을 평가한다.

import type { PipelineStateType } from "../state";

// 목적: Phase 1에서 LLM을 사용하여 RiskAssessment를 생성한다.
export async function assessRisk(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  // TODO: Phase 1에서 구현
  return { riskAssessment: state.riskAssessment };
}
