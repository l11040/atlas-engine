// 책임: DoR 의미 검증 노드. LLM으로 티켓 품질을 평가한다.

import type { CliLlm } from "../../../cli-llm";
import { extractJson, logEntry } from "../../shared/utils";
import type { TicketToTodoState } from "../state";

export function createDorSemanticNode(llm: CliLlm) {
  return async (state: TicketToTodoState): Promise<Partial<TicketToTodoState>> => {
    const { ticket } = state;

    const prompt = `당신은 ScrumMaster입니다. 아래 Ticket의 품질을 평가하세요.

## Ticket
- 제목: ${ticket.summary}
- 모드: ${ticket.mode}

### Acceptance Criteria
${ticket.acceptance_criteria.map((ac) => `- ${ac.id}: ${ac.description}`).join("\n")}

### Test Scenarios
${ticket.test_scenarios.map((ts) => `- ${ts.id} (covers: ${ts.covers.join(", ")}): ${ts.description}`).join("\n")}

## 판단 기준
1. 모든 AC가 구체적이고 검증 가능한가?
2. 시나리오가 AC를 적절히 커버하는가?
3. 리스크 수준이 수용 가능한가?

## 출력
반드시 아래 JSON 형식으로만 응답하세요:
\`\`\`json
{ "result": "proceed" | "hold", "reason": "판단 근거" }
\`\`\``;

    try {
      const response = await llm.invoke(prompt);
      const json = JSON.parse(extractJson(response));
      const result = json.result === "hold" ? "hold" : "proceed";
      const reason = json.reason || "";

      if (result === "hold") {
        return {
          phase: "dor",
          dorSemanticResult: "hold",
          dorSemanticReason: reason,
          holdReason: `DoR 의미 검증 hold: ${reason}`,
          activityLog: [logEntry(`DoR 의미 검증 hold — ${reason}`, "warning")]
        };
      }

      return {
        phase: "dor",
        dorSemanticResult: "proceed",
        dorSemanticReason: reason,
        activityLog: [logEntry(`DoR 의미 검증 통과 — ${reason}`, "success")]
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        phase: "dor",
        dorSemanticResult: "proceed",
        dorSemanticReason: `LLM 오류로 기본 통과 처리: ${msg}`,
        activityLog: [logEntry(`DoR 의미 검증 LLM 오류, 기본 통과 처리 — ${msg}`, "warning")]
      };
    }
  };
}
