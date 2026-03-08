// 책임: 검증 노드. 실행 결과를 검증하고 Evidence를 생성한다.
// 이유: v2.3 Section 1 — Verifier가 Runner 실행 결과로 PASS/FAIL 판정, Evidence를 생성한다.

import type { CliLlm } from "../../../cli-llm";
import { CliExecutionError } from "@atlas/cli-runtime";
import { buildTerminalLogFromEvents, extractJson, logEntry } from "../../shared/utils";
import type { Evidence, TodoExecutionState } from "../state";

export function createVerifyNode(llm: CliLlm) {
  return async (state: TodoExecutionState): Promise<Partial<TodoExecutionState>> => {
    const { workOrder, implReport, todo } = state;

    if (!workOrder) {
      return {
        phase: "verify",
        error: "WorkOrder가 없어 검증을 진행할 수 없습니다",
        activityLog: [logEntry("검증 실패 — WorkOrder 없음", "error")]
      };
    }

    // 목적: scope 위반이 있으면 FAIL Evidence를 즉시 생성한다 (v2.3 Section 9.3).
    if (implReport && implReport.scope_violations.length > 0) {
      const failEvidence: Evidence = {
        verdict: "FAIL",
        evidence: {
          test_pass_log: null,
          lint_clean: null,
          coverage_pct: null,
          regression_check: null,
          exit_code: null
        },
        scope_violations: implReport.scope_violations,
        failure_summary: {
          symptom: `스코프 위반 ${implReport.scope_violations.length}건 발생`,
          likely_cause: "Implementer가 forbidden_paths 또는 스코프 외 파일을 수정함",
          next_hypothesis: "스코프를 준수하여 재실행",
          suggested_next_step: "editable_paths 내 파일만 수정하도록 WorkOrder를 재생성"
        },
        terminal: buildTerminalLogFromEvents([], "scope violation")
      };

      return {
        phase: "verify",
        evidence: failEvidence,
        activityLog: [logEntry(`검증 FAIL — 스코프 위반 ${implReport.scope_violations.length}건`, "error")]
      };
    }

    // 주의: verify_cmd를 실제로 실행하도록 CLI 에이전트에 지시하되, 결과는 JSON으로 출력하게 한다.
    const prompt = `아래 검증 명령을 실행하고 결과를 JSON으로 보고하세요.

검증 명령: ${workOrder.verify_cmd}
evidence_required: ${JSON.stringify(workOrder.evidence_required)}

실행 절차:
1. "${workOrder.verify_cmd}" 명령을 실행하세요.
2. 테스트 결과, 린트 결과, exit code 등을 수집하세요.
3. 모든 evidence가 충족되면 PASS, 하나라도 불충족이면 FAIL로 판정하세요.

[IMPORTANT] 명령 실행 후, 반드시 마지막에 아래 JSON 코드 블록을 출력하세요:
\`\`\`json
{
  "verdict": "PASS",
  "evidence": {
    "test_pass_log": "테스트 실행 결과 요약",
    "lint_clean": true,
    "exit_code": 0,
    "coverage_pct": null,
    "regression_check": null
  },
  "scope_violations": [],
  "failure_summary": null
}
\`\`\`

FAIL인 경우 failure_summary를 채우세요:
{ "symptom": "증상", "likely_cause": "원인", "next_hypothesis": "가설", "suggested_next_step": "다음 행동" }

[IMPORTANT] 최종 응답은 반드시 위 JSON 코드 블록으로 끝내세요.`;

    try {
      const { text: response, events } = await llm.invokeWithEvents(prompt);
      const parsed = safeParseJson(response);

      // 이유: JSON 파싱 실패 시 응답 텍스트에서 PASS/FAIL 키워드를 추출하여 판정한다.
      if (!parsed) {
        const looksLikePass = /pass/i.test(response) && !/fail/i.test(response);
        const evidence: Evidence = {
          verdict: looksLikePass ? "PASS" : "FAIL",
          evidence: {
            test_pass_log: response.slice(0, 500),
            lint_clean: null,
            coverage_pct: null,
            regression_check: null,
            exit_code: null
          },
          scope_violations: [],
          failure_summary: looksLikePass ? null : {
            symptom: "JSON 파싱 실패 — 원본 응답에서 판정 추론",
            likely_cause: "LLM이 JSON 형식 대신 자연어를 반환함",
            next_hypothesis: "재실행 시 JSON 출력 유도 강화",
            suggested_next_step: "verify_cmd 재실행"
          },
          terminal: buildTerminalLogFromEvents(events)
        };

        return {
          phase: "verify",
          evidence,
          activityLog: [logEntry(`검증 ${evidence.verdict} (JSON 파싱 실패, 키워드 추론)`, evidence.verdict === "PASS" ? "success" : "warning")]
        };
      }

      const evidence: Evidence = {
        verdict: parsed.verdict === "FAIL" ? "FAIL" : "PASS",
        evidence: {
          test_pass_log: (parsed.evidence as Record<string, unknown>)?.test_pass_log as string ?? null,
          lint_clean: (parsed.evidence as Record<string, unknown>)?.lint_clean as boolean ?? null,
          coverage_pct: (parsed.evidence as Record<string, unknown>)?.coverage_pct as number ?? null,
          regression_check: (parsed.evidence as Record<string, unknown>)?.regression_check as boolean ?? null,
          exit_code: (parsed.evidence as Record<string, unknown>)?.exit_code as number ?? null
        },
        scope_violations: (parsed.scope_violations as string[]) || [],
        failure_summary: parsed.verdict === "FAIL" ? ((parsed.failure_summary as Evidence["failure_summary"]) || {
          symptom: "불명",
          likely_cause: "불명",
          next_hypothesis: "재실행 필요",
          suggested_next_step: "로그 확인"
        }) : null,
        terminal: buildTerminalLogFromEvents(events)
      };

      return {
        phase: "verify",
        evidence,
        activityLog: [
          logEntry(
            evidence.verdict === "PASS"
              ? `검증 PASS — ${workOrder.verify_cmd}`
              : `검증 FAIL — ${evidence.failure_summary?.symptom || "상세 불명"}`,
            evidence.verdict === "PASS" ? "success" : "error"
          )
        ]
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // 이유: 검증 실패 시 FAIL Evidence를 생성하여 dod_check에서 retry 판정을 받도록 한다.
      return {
        phase: "verify",
        evidence: {
          verdict: "FAIL",
          evidence: {
            test_pass_log: null,
            lint_clean: null,
            coverage_pct: null,
            regression_check: null,
            exit_code: null
          },
          scope_violations: [],
          failure_summary: {
            symptom: `검증 노드 오류: ${msg}`,
            likely_cause: "CLI 실행 또는 파싱 실패",
            next_hypothesis: "재실행",
            suggested_next_step: "verify_cmd 확인 후 재시도"
          },
          terminal: error instanceof CliExecutionError
            ? buildTerminalLogFromEvents(error.events, msg)
            : buildTerminalLogFromEvents([], msg)
        },
        activityLog: [logEntry(`검증 오류, FAIL 처리 — ${msg}`, "error")]
      };
    }
  };
}

function safeParseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(extractJson(text));
  } catch {
    return null;
  }
}
