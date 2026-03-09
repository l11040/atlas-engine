// 책임: LLM JSON 응답 검증을 위한 Zod 스키마를 정의한다.

import { z } from "zod";

// ─── 요구사항 분석 ────────────────────────────────────

const AcceptanceCriterionSchema = z
  .object({
    id: z.string(),
    description: z.string(),
    testable: z.boolean()
  })
  .passthrough();

const TestScenarioSchema = z
  .object({
    id: z.string(),
    description: z.string(),
    linked_ac_ids: z.array(z.string())
  })
  .passthrough();

export const ParsedRequirementsSchema = z
  .object({
    acceptance_criteria: z.array(AcceptanceCriterionSchema).default([]),
    policy_rules: z.array(z.string()).default([]),
    implementation_steps: z.array(z.string()).default([]),
    test_scenarios: z.array(TestScenarioSchema).default([]),
    missing_sections: z.array(z.string()).default([]),
    ambiguity_list: z.array(z.string()).default([]),
    dependency_list: z.array(z.string()).default([]),
    description_raw: z.string().default("")
  })
  .passthrough();

// ─── 위험 평가 ────────────────────────────────────────

const RiskFactorSchema = z
  .object({
    category: z.string(),
    description: z.string(),
    severity: z.enum(["low", "medium", "high"])
  })
  .passthrough();

export const RiskAssessmentSchema = z
  .object({
    level: z.enum(["low", "medium", "high"]),
    factors: z.array(RiskFactorSchema).default([]),
    recommendation: z.string().default("")
  })
  .passthrough();

// ─── 실행 계획 ────────────────────────────────────────

const TaskUnitScopeSchema = z
  .object({
    editable_paths: z.array(z.string()).default([]),
    forbidden_paths: z.array(z.string()).default([])
  })
  .passthrough();

const TaskUnitSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    linked_ac_ids: z.array(z.string()).default([]),
    deps: z.array(z.string()).default([]),
    scope: TaskUnitScopeSchema,
    verify_cmd: z.string().nullable().default(null)
  })
  .passthrough();

export const ExecutionPlanSchema = z
  .object({
    tasks: z.array(TaskUnitSchema),
    execution_order: z.array(z.string()),
    validation_strategy: z.string(),
    rollback_strategy: z.string()
  })
  .passthrough();

// ─── 변경 설명 ────────────────────────────────────────

const ChangeReasonSchema = z
  .object({
    path: z.string(),
    reason: z.string(),
    linked_ac_ids: z.array(z.string()).default([])
  })
  .passthrough();

export const ChangeExplanationSchema = z
  .object({
    summary: z.string().default(""),
    implementation_rationale: z.string().default(""),
    change_reasons: z.array(ChangeReasonSchema).default([]),
    policy_considerations: z.array(z.string()).default([]),
    alternatives_considered: z.array(z.string()).default([]),
    risk_notes: z.array(z.string()).default([])
  })
  .passthrough();

// ─── 검증 결과 ────────────────────────────────────────

const VerificationCheckSchema = z
  .object({
    name: z.string(),
    passed: z.boolean(),
    detail: z.string()
  })
  .passthrough();

export const VerificationResultSchema = z
  .object({
    verdict: z.enum(["pass", "fail"]).optional(),
    checks: z.array(VerificationCheckSchema).default([]),
    failure_reasons: z.array(z.string()).default([])
  })
  .passthrough();
