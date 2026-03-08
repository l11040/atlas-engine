// 책임: 티켓 데이터를 파이프라인 상태에 로드한다.

import type { PipelineStateType } from "../state";

// 목적: Phase 1에서 Jira API 또는 수동 입력 데이터를 로드한다.
export async function ingest(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  // TODO: Phase 1에서 구현
  return { description: state.description };
}
