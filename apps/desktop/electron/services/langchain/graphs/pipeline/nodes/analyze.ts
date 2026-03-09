// 책임: 티켓 Description을 구조화된 요구사항으로 파싱한다.

import { CliLlm } from "../../../cli-llm";
import { getSettings } from "../../../../config/settings";
import { safeParseJson } from "../../shared/utils";
import { ParsedRequirementsSchema } from "../../shared/schemas";
import type { ParsedRequirements } from "../../../../../../shared/ipc";
import type { PipelineStateType } from "../state";
import { appendRunCliEvent } from "../../../../automation/run-log-service";

const SYSTEM_PROMPT = `당신은 시니어 소프트웨어 요구사항 분석가입니다. Jira 티켓 설명을 분석하여 구조화된 요구사항을 추출하세요.

**중요: 모든 텍스트 값(description, 규칙, 단계 등)은 반드시 한글로 작성하세요. 코드 식별자와 기술 용어만 영어를 허용합니다.**

반드시 아래 스키마에 맞는 단일 JSON 객체로 응답하세요:

{
  "acceptance_criteria": [
    { "id": "AC-1", "description": "한글로 작성", "testable": true }
  ],
  "policy_rules": ["한글로 작성"],
  "implementation_steps": ["한글로 작성"],
  "test_scenarios": [
    { "id": "TS-1", "description": "한글로 작성", "linked_ac_ids": ["AC-1"] }
  ],
  "missing_sections": ["한글로 작성"],
  "ambiguity_list": ["한글로 작성"],
  "dependency_list": ["한글로 작성"],
  "description_raw": "원본 텍스트 그대로"
}

규칙:
- "acceptance_criteria": 모든 인수 기준을 추출합니다. "AC-1", "AC-2" 형태의 ID를 생성합니다. 구체적 테스트로 검증 가능하면 "testable"을 true로 설정합니다.
- "policy_rules": 비즈니스 규칙, 제약조건, 정책을 추출합니다.
- "implementation_steps": 기술적 구현 단계를 순서대로 분해합니다. 구체적으로 작성합니다.
- "test_scenarios": 인수 기준을 커버하는 테스트 시나리오를 생성합니다. 관련 AC ID를 연결합니다.
- "missing_sections": 구현 전 명확히 해야 할 정보 공백을 나열합니다. 티켓이 잘 정의되어 있으면 빈 배열을 사용합니다.
- "ambiguity_list": 모호하거나, 충돌하거나, 불충분한 서술을 나열합니다.
- "dependency_list": 기술적 의존성과 전제조건을 나열합니다.
- "description_raw": 원본 티켓 설명 텍스트를 그대로 복사합니다.

철저하게 분석하세요. 티켓이 모호하더라도 가능한 것을 추출하고 부족한 점은 "missing_sections"에 기록하세요.
JSON 객체만 응답하세요. 추가 텍스트는 넣지 마세요.`;

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
    const { text } = await llm.invokeWithEvents(
      `${SYSTEM_PROMPT}\n\n---\n\nAnalyze the following ticket:\n\n${state.description}`,
      {
        onEvent: (event) => {
          appendRunCliEvent({
            step: "analyze",
            node: "analyze",
            event
          });
        }
      }
    );

    const result = safeParseJson(text, ParsedRequirementsSchema);
    if (!result.success) {
      return { error: `요구사항 분석 응답 파싱 실패: ${result.error}` };
    }

    const parsed: ParsedRequirements = {
      ...result.data,
      description_raw: result.data.description_raw || state.description
    };

    return { parsedRequirements: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `요구사항 분석 실패: ${message}` };
  }
}
