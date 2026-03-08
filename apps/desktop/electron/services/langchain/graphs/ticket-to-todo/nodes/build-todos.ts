// 책임: Todo 생성 노드. LLM으로 AC↔시나리오 매핑 기반 원자 작업을 생성한다.

import type { TodoItem, TodoRisk, TodoRoute } from "../../../../../../shared/ipc";
import type { CliLlm } from "../../../cli-llm";
import { extractJson, logEntry } from "../../shared/utils";
import type { TicketToTodoState } from "../state";

export function createBuildTodosNode(llm: CliLlm) {
  return async (state: TicketToTodoState): Promise<Partial<TicketToTodoState>> => {
    const { ticket } = state;
    const maxAttempt = ticket.mode === "fast" ? 2 : ticket.mode === "strict" ? 5 : 3;

    const prompt = `당신은 Completion Engine의 Plan 모듈입니다. 아래 Ticket에서 Todo 목록을 생성하세요.

## Ticket
- jira_key: ${ticket.jira_key}
- 제목: ${ticket.summary}
- 모드: ${ticket.mode}

### Acceptance Criteria
${ticket.acceptance_criteria.map((ac) => `- ${ac.id}: ${ac.description}`).join("\n")}

### Test Scenarios
${ticket.test_scenarios.map((ts) => `- ${ts.id} (covers: ${ts.covers.join(", ")}): ${ts.description}`).join("\n")}

## AC↔시나리오 매핑 규칙
1. **1:1** — AC 1개 : 시나리오 1개 → todo 1개
2. **1:N** — AC 1개 : 시나리오 N개 → 시나리오 단위로 todo 분할
3. **N:1** — AC N개 : 시나리오 1개 → todo 1개, reason에 모든 AC 기록
4. **결손** — AC에 대응하는 시나리오가 없으면 → hold (부분 생성 없음)

## 라우팅 규칙
- 경로에 frontend/, web/, components/ 포함 → route: "FE"
- 경로에 backend/, api/, services/, db/ 포함 → route: "BE"
- 양쪽 다 → split하여 FE todo + BE todo 분리

## 의존성 규칙
- DB/인프라 작업이 선행되어야 하는 경우 deps에 기록
- 독립적인 작업은 deps: []

## Todo 스키마
각 todo는 다음 필드를 포함해야 합니다:
- id: "todo-001" 형식
- title: 한 문장 원자 작업
- reason: "AC-1 → TS-2" 형식 (추적성 필수)
- deps: 의존하는 todo id 배열
- risk: "low" | "med" | "high"
- route: "FE" | "BE"
- status: "pending" (항상)
- attempt: { "n": 0, "max": ${maxAttempt} }
- failure_history: [] (항상 빈 배열)

## 출력
결손이 있으면:
\`\`\`json
{ "status": "hold", "reason": "AC-2 → TS-? (missing)" }
\`\`\`

결손이 없으면:
\`\`\`json
{ "status": "ok", "todos": [...] }
\`\`\``;

    try {
      const response = await llm.invoke(prompt);
      const json = JSON.parse(extractJson(response));

      if (json.status === "hold") {
        return {
          phase: "plan",
          holdReason: `AC↔시나리오 매핑 결손: ${json.reason}`,
          activityLog: [logEntry(`Todo 생성 hold — ${json.reason}`, "error")]
        };
      }

      const todos: TodoItem[] = (json.todos || []).map((t: Record<string, unknown>, idx: number) => ({
        id: (t.id as string) || `todo-${String(idx + 1).padStart(3, "0")}`,
        title: (t.title as string) || "",
        reason: (t.reason as string) || "",
        deps: (t.deps as string[]) || [],
        risk: ((t.risk as string) || "low") as TodoRisk,
        route: ((t.route as string) || "BE") as TodoRoute,
        status: "pending" as const,
        attempt: { n: 0, max: maxAttempt },
        failure_history: []
      }));

      return {
        phase: "plan",
        todos,
        activityLog: [logEntry(`Todo ${todos.length}개 생성 완료`, "success")]
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        phase: "plan",
        holdReason: `Todo 생성 LLM 오류: ${msg}`,
        activityLog: [logEntry(`Todo 생성 실패 — ${msg}`, "error")]
      };
    }
  };
}
