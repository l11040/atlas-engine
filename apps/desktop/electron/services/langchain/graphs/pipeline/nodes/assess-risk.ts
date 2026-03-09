// 책임: 변경 범위·복잡도·회귀 위험을 평가한다.

import { CliLlm } from "../../../cli-llm";
import { getSettings } from "../../../../config/settings";
import { safeParseJson } from "../../shared/utils";
import { RiskAssessmentSchema } from "../../shared/schemas";
import type { RiskAssessment } from "../../../../../../shared/ipc";
import type { PipelineStateType } from "../state";
import { appendRunCliEvent } from "../../../../automation/run-log-service";

const SYSTEM_PROMPT = `당신은 시니어 소프트웨어 엔지니어로서 개발 작업의 위험도를 평가합니다. Jira 티켓의 파싱된 요구사항을 기반으로 위험 요소를 분석하고 구조화된 평가를 제공하세요.

**중요: 모든 텍스트 값(description, recommendation 등)은 반드시 한글로 작성하세요. 카테고리 키와 레벨 값만 영어를 허용합니다.**

반드시 아래 스키마에 맞는 단일 JSON 객체로 응답하세요:

{
  "level": "low" | "medium" | "high",
  "factors": [
    { "category": "...", "description": "한글로 작성", "severity": "low" | "medium" | "high" }
  ],
  "recommendation": "한글로 작성"
}

위험 평가 기준:

1. 범위 및 복잡도:
   - 인수 기준 및 구현 단계의 수
   - 횡단 관심사 (인증, i18n, 캐싱 등)
   - 영향받는 시스템 컴포넌트의 수

2. 의존성 및 통합:
   - dependency_list 항목 및 외부 API 의존성
   - DB 스키마 변경
   - 공유 라이브러리 수정
   - 서비스 간 통신 변경

3. 회귀 및 품질:
   - 테스트 커버리지 공백 (테스트 불가능한 인수 기준)
   - 누락된 명세 및 ambiguity_list 항목
   - 기존 기능에 미치는 영향

4. 운영:
   - 배포 복잡도 (마이그레이션, 피처 플래그)
   - 롤백 난이도
   - 성능 영향

카테고리 값: "scope", "dependency", "regression", "operational", "specification_gap"

전체 레벨 규칙:
- "high": severity "high"인 요소가 1개 이상, 또는 "medium"인 요소가 3개 이상, 또는 치명적 명세 공백
- "medium": severity "medium"인 요소가 1~2개, 또는 보통 수준의 명세 공백
- "low": 모든 요소가 "low"이고 의미 있는 공백 없음

"recommendation"은 팀에 대한 간결한 조언(1~3문장)으로 한글 작성합니다.

JSON 객체만 응답하세요. 추가 텍스트는 넣지 마세요.`;

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
    const { text } = await llm.invokeWithEvents(
      `${SYSTEM_PROMPT}\n\n---\n\nAssess the risk for the following parsed requirements:\n\n${requirementsContext}`,
      {
        onEvent: (event) => {
          appendRunCliEvent({
            step: "risk",
            node: "assess_risk",
            event
          });
        }
      }
    );

    const result = safeParseJson(text, RiskAssessmentSchema);
    if (!result.success) {
      return { error: `위험 평가 응답 파싱 실패: ${result.error}` };
    }

    const parsed: RiskAssessment = { ...result.data };

    // 주의: 위험 요소가 비어 있으면 중간 수준 불확실성으로 처리한다.
    if (parsed.factors.length === 0) {
      parsed.factors = [
        {
          category: "specification_gap",
          description: "명시적 위험 요소가 반환되지 않았습니다. 중간 수준 불확실성으로 처리합니다.",
          severity: "medium"
        }
      ];
      if (!parsed.recommendation) {
        parsed.recommendation = "주의하여 진행하고 검증 범위를 강화하세요.";
      }
      if (parsed.level === "low") parsed.level = "medium";
    }

    return { riskAssessment: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `위험 평가 실패: ${message}` };
  }
}
