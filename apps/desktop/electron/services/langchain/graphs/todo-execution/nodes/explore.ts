// 책임: 탐색 노드. WorkOrder 기반으로 코드베이스를 탐색하여 Context Pack을 생성한다.
// 이유: v2.3 Section 1 — Explorer가 탐색/재현/파일·테스트 위치 파악, 스코프 추천을 담당한다.

import type { CliLlm } from "../../../cli-llm";
import { CliExecutionError } from "../../../cli-spawn-runner";
import { buildTerminalLogFromEvents, extractJson, logEntry } from "../../shared/utils";
import type { ContextPack, TodoExecutionState } from "../state";

export function createExploreNode(llm: CliLlm) {
  return async (state: TodoExecutionState): Promise<Partial<TodoExecutionState>> => {
    const { workOrder, todo, cwd } = state;

    if (!workOrder) {
      return {
        phase: "explore",
        error: "WorkOrder가 없어 탐색을 진행할 수 없습니다",
        activityLog: [logEntry("탐색 실패 — WorkOrder 없음", "error")]
      };
    }

    // 주의: 파일 수정 금지를 명시하여 CLI 에이전트가 읽기만 수행하도록 유도한다.
    const prompt = `[IMPORTANT] 파일을 수정하지 마세요. 코드베이스를 읽어서 분석한 뒤, 결과를 반드시 JSON 코드 블록 하나로만 응답하세요.

프로젝트 경로: ${cwd}

아래 작업에 관련된 파일을 탐색하세요:
- 작업: ${workOrder.task}
- 예상 결과: ${workOrder.expected_outcome}
- 라우트: ${todo.route}

탐색 후 반드시 아래 JSON 형식으로 최종 응답하세요:
\`\`\`json
{
  "relevant_files": ["관련 소스 파일 경로 목록"],
  "test_files": ["관련 테스트 파일 경로 목록"],
  "scope_suggestion": {
    "editable_paths": ["수정해야 할 파일 경로"],
    "forbidden_paths": ["수정 금지 경로"]
  },
  "notes": "구현 시 참고할 사항 요약"
}
\`\`\`

[IMPORTANT] 최종 응답은 반드시 위 JSON 코드 블록이어야 합니다.`;

    try {
      const { text: response, events } = await llm.invokeWithEvents(prompt);
      const parsed = safeParseJson(response);

      const contextPack: ContextPack = {
        relevant_files: (parsed?.relevant_files as string[]) || [],
        test_files: (parsed?.test_files as string[]) || [],
        scope_suggestion: {
          editable_paths: (parsed?.scope_suggestion as Record<string, string[]>)?.editable_paths || workOrder.scope.editable_paths,
          forbidden_paths: (parsed?.scope_suggestion as Record<string, string[]>)?.forbidden_paths || workOrder.scope.forbidden_paths
        },
        notes: (parsed?.notes as string) || "",
        terminal: buildTerminalLogFromEvents(events)
      };

      return {
        phase: "explore",
        contextPack,
        activityLog: [logEntry(`탐색 완료 — 관련 파일 ${contextPack.relevant_files.length}개, 테스트 ${contextPack.test_files.length}개`, "success")]
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // 이유: 탐색 실패는 치명적이지 않으므로 빈 Context Pack으로 진행한다.
      const terminal = error instanceof CliExecutionError
        ? buildTerminalLogFromEvents(error.events, msg)
        : buildTerminalLogFromEvents([], msg);
      return {
        phase: "explore",
        contextPack: {
          relevant_files: [],
          test_files: [],
          scope_suggestion: workOrder.scope,
          notes: `탐색 실패, WorkOrder 원본 스코프로 진행: ${msg}`,
          terminal
        },
        activityLog: [logEntry(`탐색 LLM 오류, 기본 스코프로 진행 — ${msg}`, "warning")]
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
