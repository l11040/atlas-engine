// 책임: 변경 범위·복잡도·회귀 위험을 평가한다.

import { CliLlm } from "../../../cli-llm";
import { getSettings } from "../../../../config/settings";
import { extractJson } from "../../shared/utils";
import type { RiskAssessment } from "../../../../../../shared/ipc";
import type { PipelineStateType } from "../state";

const SYSTEM_PROMPT = `You are a senior software engineer performing a risk assessment for a development task. Given the parsed requirements of a Jira ticket, evaluate the risk factors and provide a structured assessment.

You MUST respond with a single JSON object matching this exact schema:

{
  "level": "low" | "medium" | "high",
  "factors": [
    { "category": "...", "description": "...", "severity": "low" | "medium" | "high" }
  ],
  "recommendation": "..."
}

Risk evaluation criteria:

1. Scope & Complexity:
   - Number of acceptance criteria and implementation steps
   - Cross-cutting concerns (auth, i18n, caching, etc.)
   - Number of system components affected

2. Dependencies & Integration:
   - External API dependencies
   - Database schema changes
   - Shared library modifications
   - Inter-service communication changes

3. Regression & Quality:
   - Test coverage gaps (non-testable acceptance criteria)
   - Missing specifications identified in the requirements
   - Impact on existing functionality

4. Operational:
   - Deployment complexity (migrations, feature flags)
   - Rollback difficulty
   - Performance implications

Categories for factors: "scope", "dependency", "regression", "operational", "specification_gap"

Overall level rules:
- "high": Any factor with severity "high", OR 3+ factors with severity "medium", OR critical missing specifications
- "medium": 1-2 factors with severity "medium", OR moderate missing specifications
- "low": All factors are "low" severity and no significant gaps

The "recommendation" field should be a concise actionable summary (1-3 sentences) advising the team on how to proceed.

Respond ONLY with the JSON object, no additional text.`;

// 목적: LLM을 사용하여 파싱된 요구사항 기반으로 RiskAssessment를 생성한다.
export async function assessRisk(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  if (!state.parsedRequirements) {
    return { error: "위험 평가를 수행할 파싱된 요구사항이 없습니다." };
  }

  const settings = getSettings();
  const llm = new CliLlm({
    provider: settings.activeProvider,
    cwd: settings.defaultCwd || process.cwd(),
    allowTools: false,
    timeoutMs: settings.cli.timeoutMs
  });

  try {
    const requirementsContext = JSON.stringify(state.parsedRequirements, null, 2);
    const response = await llm.invoke(
      `${SYSTEM_PROMPT}\n\n---\n\nAssess the risk for the following parsed requirements:\n\n${requirementsContext}`
    );

    const jsonStr = extractJson(response);
    const parsed: RiskAssessment = JSON.parse(jsonStr);

    // 주의: level 값이 허용된 범위인지 검증한다.
    if (!["low", "medium", "high"].includes(parsed.level)) {
      return { error: `유효하지 않은 위험 레벨: ${parsed.level}` };
    }

    if (!Array.isArray(parsed.factors)) {
      return { error: "LLM 응답에 factors 배열이 없습니다." };
    }

    return { riskAssessment: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `위험 평가 실패: ${message}` };
  }
}
