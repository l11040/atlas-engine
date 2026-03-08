// 책임: 파이프라인 그래프의 조건부 라우팅을 정의한다.

import type { PipelineStateType } from "./state";

// 목적: analyze 노드 이후 missing_sections 여부로 분기한다.
export function routeAfterAnalyze(state: PipelineStateType): "assess_risk" | "__end__" {
  if (state.parsedRequirements?.missing_sections?.length) {
    return "__end__";
  }
  return "assess_risk";
}

// 목적: assess_risk 노드 이후 위험 레벨로 분기한다.
export function routeAfterRisk(state: PipelineStateType): "plan" | "__end__" {
  if (state.riskAssessment?.level === "high") {
    return "__end__";
  }
  return "plan";
}

// 목적: plan 노드 이후 tasks 존재 여부로 분기한다.
export function routeAfterPlan(state: PipelineStateType): "__end__" {
  return "__end__";
}
