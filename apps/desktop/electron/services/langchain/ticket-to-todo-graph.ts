// 책임: Ticket → Todo 변환 LangGraph 그래프를 정의한다.
// 파이프라인: dor_formal → dor_semantic → build_todos → finalize

import { StateGraph, Annotation, END } from "@langchain/langgraph";
import type { CliLlm } from "./cli-llm";
import type {
  Ticket,
  TodoItem,
  TodoRisk,
  TodoRoute,
  PipelinePhase,
  ActivityLogEntry
} from "../../../shared/ipc";

// ─── 그래프 상태 ─────────────────────────────────────────

export const TicketToTodoAnnotation = Annotation.Root({
  ticket: Annotation<Ticket>,
  phase: Annotation<PipelinePhase>({ reducer: (_, v) => v, default: () => "idle" }),
  dorFormalResult: Annotation<"pass" | "hold">({ reducer: (_, v) => v, default: () => "pass" }),
  dorFormalReason: Annotation<string>({ reducer: (_, v) => v, default: () => "" }),
  dorSemanticResult: Annotation<"proceed" | "hold">({ reducer: (_, v) => v, default: () => "proceed" }),
  dorSemanticReason: Annotation<string>({ reducer: (_, v) => v, default: () => "" }),
  todos: Annotation<TodoItem[]>({ reducer: (_, v) => v, default: () => [] }),
  holdReason: Annotation<string>({ reducer: (_, v) => v, default: () => "" }),
  activityLog: Annotation<ActivityLogEntry[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => []
  })
});

export type TicketToTodoState = typeof TicketToTodoAnnotation.State;

// ─── 유틸 ────────────────────────────────────────────────

function logEntry(message: string, type: ActivityLogEntry["type"] = "info"): ActivityLogEntry {
  return { timestamp: Date.now(), message, type };
}

// 목적: LLM 응답에서 JSON 블록을 추출한다.
function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  const braceMatch = text.match(/[\[{][\s\S]*[\]}]/);
  if (braceMatch) return braceMatch[0].trim();
  return text.trim();
}

// ─── 노드: dor_formal (결정론적) ─────────────────────────

function dorFormalNode(state: TicketToTodoState): Partial<TicketToTodoState> {
  const { ticket } = state;

  if (!ticket.test_scenarios || ticket.test_scenarios.length === 0) {
    return {
      phase: "dor",
      dorFormalResult: "hold",
      dorFormalReason: "시나리오 섹션이 존재하지 않습니다",
      holdReason: "DoR 형식 검증 실패: 시나리오 섹션 없음",
      activityLog: [logEntry("DoR 형식 검증 실패 — 시나리오 섹션 없음", "error")]
    };
  }

  if (!ticket.acceptance_criteria || ticket.acceptance_criteria.length === 0) {
    return {
      phase: "dor",
      dorFormalResult: "hold",
      dorFormalReason: "Acceptance Criteria가 존재하지 않습니다",
      holdReason: "DoR 형식 검증 실패: AC 없음",
      activityLog: [logEntry("DoR 형식 검증 실패 — AC 없음", "error")]
    };
  }

  return {
    phase: "dor",
    dorFormalResult: "pass",
    dorFormalReason: `AC ${ticket.acceptance_criteria.length}개, 시나리오 ${ticket.test_scenarios.length}개 확인`,
    activityLog: [logEntry(`DoR 형식 검증 통과 — AC ${ticket.acceptance_criteria.length}개, 시나리오 ${ticket.test_scenarios.length}개`, "success")]
  };
}

// ─── 노드: dor_semantic (LLM) ────────────────────────────

function createDorSemanticNode(llm: CliLlm) {
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

// ─── 노드: build_todos (LLM — 핵심) ─────────────────────

function createBuildTodosNode(llm: CliLlm) {
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

// ─── 노드: finalize ──────────────────────────────────────

function finalizeNode(state: TicketToTodoState): Partial<TicketToTodoState> {
  return {
    phase: "plan",
    activityLog: [logEntry("파이프라인 완료 — Todo 생성 단계 완료", "success")]
  };
}

// ─── 조건부 라우팅 ───────────────────────────────────────

function afterDorFormal(state: TicketToTodoState): "dor_semantic" | "hold_end" {
  return state.dorFormalResult === "pass" ? "dor_semantic" : "hold_end";
}

function afterDorSemantic(state: TicketToTodoState): "build_todos" | "hold_end" {
  return state.dorSemanticResult === "proceed" ? "build_todos" : "hold_end";
}

function afterBuildTodos(state: TicketToTodoState): "finalize" | "hold_end" {
  return state.holdReason ? "hold_end" : "finalize";
}

// 목적: hold 상태로 종료하는 노드
function holdEndNode(state: TicketToTodoState): Partial<TicketToTodoState> {
  return {
    phase: "hold",
    activityLog: [logEntry(`파이프라인 hold — ${state.holdReason}`, "warning")]
  };
}

// ─── 그래프 빌드 ─────────────────────────────────────────

// 목적: startFromNode에 따라 진입점이 다른 그래프를 빌드한다.
// 이유: 전체 재실행 없이 특정 단계부터 재실행하여 LLM 호출 비용을 절약한다.
export function buildTicketToTodoGraph(llm: CliLlm, startFromNode?: string) {
  const graph = new StateGraph(TicketToTodoAnnotation)
    .addNode("dor_formal", dorFormalNode)
    .addNode("dor_semantic", createDorSemanticNode(llm))
    .addNode("build_todos", createBuildTodosNode(llm))
    .addNode("finalize", finalizeNode)
    .addNode("hold_end", holdEndNode);

  // 목적: 지정된 시작 노드로 그래프 진입점을 설정한다.
  if (startFromNode === "dor_semantic") {
    graph.addEdge("__start__", "dor_semantic");
  } else if (startFromNode === "build_todos") {
    graph.addEdge("__start__", "build_todos");
  } else {
    graph.addEdge("__start__", "dor_formal");
  }

  graph.addConditionalEdges("dor_formal", afterDorFormal);
  graph.addConditionalEdges("dor_semantic", afterDorSemantic);
  graph.addConditionalEdges("build_todos", afterBuildTodos);
  graph.addEdge("finalize", END);
  graph.addEdge("hold_end", END);

  return graph.compile();
}
