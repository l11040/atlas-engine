// 책임: 티켓 Description을 구조화된 요구사항으로 파싱한다.

import { CliLlm } from "../../../cli-llm";
import { getSettings } from "../../../../config/settings";
import { extractJson } from "../../shared/utils";
import type { ParsedRequirements } from "../../../../../../shared/ipc";
import type { PipelineStateType } from "../state";

const SYSTEM_PROMPT = `You are a senior software requirements analyst. Your task is to analyze a Jira ticket description and extract structured requirements.

You MUST respond with a single JSON object matching this exact schema:

{
  "acceptance_criteria": [
    { "id": "AC-1", "description": "...", "testable": true }
  ],
  "policy_rules": ["..."],
  "implementation_steps": ["..."],
  "test_scenarios": [
    { "id": "TS-1", "description": "...", "linked_ac_ids": ["AC-1"] }
  ],
  "missing_sections": ["..."],
  "description_raw": "..."
}

Rules:
- "acceptance_criteria": Extract every acceptance criterion. Generate an id like "AC-1", "AC-2", etc. Set "testable" to true if the criterion can be verified with a concrete test, false otherwise.
- "policy_rules": Extract any business rules, constraints, or policies mentioned (e.g., "must support i18n", "must not break existing API").
- "implementation_steps": Break the work into ordered technical implementation steps. Be specific.
- "test_scenarios": Create test scenarios that cover the acceptance criteria. Link each scenario to relevant AC ids.
- "missing_sections": List any information gaps that should be clarified before implementation (e.g., "No error handling behavior specified", "Edge case for empty input not defined"). If the ticket is well-defined, use an empty array.
- "description_raw": Copy the original ticket description text as-is.

Be thorough. If the ticket is vague, still extract what you can and list gaps in "missing_sections".
Respond ONLY with the JSON object, no additional text.`;

// 목적: LLM을 사용하여 Description을 ParsedRequirements로 변환한다.
export async function analyze(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  if (!state.description) {
    return { error: "분석할 티켓 설명이 없습니다." };
  }

  const settings = getSettings();
  const llm = new CliLlm({
    provider: settings.activeProvider,
    cwd: settings.defaultCwd || process.cwd(),
    allowTools: false,
    timeoutMs: settings.cli.timeoutMs
  });

  try {
    const response = await llm.invoke(
      `${SYSTEM_PROMPT}\n\n---\n\nAnalyze the following ticket:\n\n${state.description}`
    );

    const jsonStr = extractJson(response);
    const parsed: ParsedRequirements = JSON.parse(jsonStr);

    // 주의: 필수 필드 존재 여부를 검증한다. LLM이 스키마를 따르지 않을 수 있다.
    if (!Array.isArray(parsed.acceptance_criteria)) {
      return { error: "LLM 응답에 acceptance_criteria 배열이 없습니다." };
    }

    return { parsedRequirements: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `요구사항 분석 실패: ${message}` };
  }
}
