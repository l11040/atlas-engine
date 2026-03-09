// 책임: 파이프라인 그래프의 조건부 라우팅을 정의한다.

import type { PipelineStateType } from "./state";

// 목적: analyze 노드 이후에는 항상 risk assessment를 진행한다.
// 이유: missing_sections는 차단 조건이 아니라 이후 계획에 반영할 정보다.
export function routeAfterAnalyze(_state: PipelineStateType): "assess_risk" {
  return "assess_risk";
}

// 목적: assess_risk 노드 이후에는 항상 plan을 생성한다.
// 이유: high risk는 차단 신호가 아니라 계획/검증 강화 신호다.
export function routeAfterRisk(_state: PipelineStateType): "plan" {
  return "plan";
}

// 목적: plan 노드 이후 tasks 존재 여부로 분기한다.
export function routeAfterPlan(_state: PipelineStateType): "__end__" {
  return "__end__";
}
