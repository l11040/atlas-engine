// 책임: DoD 검증 노드. Evidence가 evidence_required를 충족하는지 결정론적으로 검증한다.
// 이유: v2.3 Section 6 — DoDHook은 형식적 게이트로, evidence_required 충족 여부를 기계적으로 검증한다.

import { logEntry } from "../../shared/utils";
import type { Evidence, TodoExecutionState } from "../state";

// 목적: evidence_required 항목별 유효성을 검증한다 (v2.3 Section 9.3 DoDHook 3단계).
function validateEvidenceKey(evidence: Evidence["evidence"], key: string): { valid: boolean; reason: string } {
  const value = evidence[key as keyof typeof evidence];

  // 1단계: 키 존재
  if (value === undefined) {
    return { valid: false, reason: `${key} 키가 존재하지 않음` };
  }

  // 2단계: null 금지
  if (value === null) {
    return { valid: false, reason: `${key} 값이 null` };
  }

  // 3단계: 타입별 유효 조건
  switch (key) {
    case "test_pass_log":
      if (typeof value !== "string" || value === "") {
        return { valid: false, reason: "test_pass_log가 비어 있음" };
      }
      break;
    case "lint_clean":
      if (value !== true) {
        return { valid: false, reason: "lint_clean이 true가 아님" };
      }
      break;
    case "coverage_pct":
      if (typeof value !== "number" || value < 0 || value > 100) {
        return { valid: false, reason: `coverage_pct 범위 초과: ${value}` };
      }
      break;
    case "regression_check":
      if (value !== true) {
        return { valid: false, reason: "regression_check가 true가 아님" };
      }
      break;
  }

  return { valid: true, reason: "" };
}

export function dodCheckNode(state: TodoExecutionState): Partial<TodoExecutionState> {
  const { evidence, workOrder, error } = state;

  // 목적: 이전 단계에서 에러가 발생했으면 DoD fail 처리한다.
  if (error) {
    return {
      phase: "dod",
      dodResult: "fail",
      dodReason: `이전 단계 에러: ${error}`,
      finalVerdict: "retry",
      activityLog: [logEntry(`DoD 검증 실패 — 이전 단계 에러: ${error}`, "error")]
    };
  }

  if (!evidence) {
    return {
      phase: "dod",
      dodResult: "fail",
      dodReason: "Evidence가 생성되지 않음",
      finalVerdict: "retry",
      activityLog: [logEntry("DoD 검증 실패 — Evidence 없음", "error")]
    };
  }

  // 목적: Evidence verdict가 FAIL이면 즉시 DoD fail 처리한다.
  if (evidence.verdict === "FAIL") {
    return {
      phase: "dod",
      dodResult: "fail",
      dodReason: evidence.failure_summary?.symptom || "검증 실패",
      finalVerdict: "retry",
      activityLog: [logEntry(`DoD 검증 실패 — 검증 판정 FAIL: ${evidence.failure_summary?.symptom || "상세 불명"}`, "error")]
    };
  }

  // 목적: evidence_required 항목별 형식 검증 (DoDHook 3단계).
  const evidenceRequired = workOrder?.evidence_required || ["test_pass_log"];
  const failures: string[] = [];

  for (const key of evidenceRequired) {
    const result = validateEvidenceKey(evidence.evidence, key);
    if (!result.valid) {
      failures.push(result.reason);
    }
  }

  if (failures.length > 0) {
    const reason = failures.join(", ");
    return {
      phase: "dod",
      dodResult: "fail",
      dodReason: `evidence_required 불충족: ${reason}`,
      finalVerdict: "retry",
      activityLog: [logEntry(`DoD 검증 실패 — ${reason}`, "error")]
    };
  }

  // 목적: 모든 검증 통과 시 done 처리한다.
  return {
    phase: "dod",
    dodResult: "pass",
    dodReason: "모든 evidence_required 충족",
    finalVerdict: "done",
    activityLog: [logEntry("DoD 검증 통과 — 작업 완료", "success")]
  };
}
