// 책임: 실행 노드. WorkOrder + Context Pack을 기반으로 코드 변경을 수행한다.
// 이유: v2.3 Section 1 — Implementer가 스코프/금지 준수하며 코드를 변경하고 변경 보고를 생성한다.

import type { CliLlm } from "../../../cli-llm";
import { CliExecutionError } from "../../../cli-spawn-runner";
import { getGitDiff } from "../../../../git/diff";
import { buildTerminalLogFromEvents, extractJson, logEntry } from "../../shared/utils";
import type { ImplReport, TodoExecutionState } from "../state";

export function createExecuteNode(llm: CliLlm) {
  return async (state: TodoExecutionState): Promise<Partial<TodoExecutionState>> => {
    const { workOrder, contextPack, cwd } = state;

    if (!workOrder) {
      return {
        phase: "execute",
        error: "WorkOrder가 없어 실행을 진행할 수 없습니다",
        activityLog: [logEntry("실행 실패 — WorkOrder 없음", "error")]
      };
    }

    const scopeInfo = contextPack
      ? `수정 대상 파일: ${JSON.stringify(contextPack.scope_suggestion.editable_paths)}
수정 금지 파일: ${JSON.stringify(contextPack.scope_suggestion.forbidden_paths)}
참고 사항: ${contextPack.notes}`
      : `수정 대상 파일: ${JSON.stringify(workOrder.scope.editable_paths)}
수정 금지 파일: ${JSON.stringify(workOrder.scope.forbidden_paths)}`;

    // 주의: execute 노드는 실제 코드 변경을 CLI 에이전트에 위임한다.
    // CLI 에이전트가 작업을 수행한 후 반드시 JSON 리포트를 출력하도록 유도한다.
    const prompt = `아래 WorkOrder에 따라 코드를 변경하세요.

작업: ${workOrder.task}
예상 결과: ${workOrder.expected_outcome}
반드시 할 것: ${JSON.stringify(workOrder.must_do)}
절대 하지 말 것: ${JSON.stringify(workOrder.must_not)}
${scopeInfo}

작업 규칙:
- scope 내 파일만 수정하세요.
- forbidden_paths 파일은 절대 수정하지 마세요.
- must_not 항목은 절대 하지 마세요.

모든 작업을 완료한 후, 마지막에 반드시 아래 형식의 JSON 코드 블록을 출력하세요:
\`\`\`json
{
  "changes": [{ "path": "변경한 파일 경로", "action": "modify", "diff_summary": "변경 내용 요약" }],
  "scope_violations": [],
  "tests_added": ["추가한 테스트 파일"],
  "notes": "구현 메모"
}
\`\`\`

[IMPORTANT] 작업 완료 후 반드시 위 JSON 코드 블록으로 끝내세요.`;

    try {
      const { text: response, events } = await llm.invokeWithEvents(prompt);
      const parsed = safeParseJson(response);

      // 이유: JSON 파싱 실패 시에도 LLM이 작업을 수행했을 수 있으므로 기본 리포트로 진행한다.
      const implReport: ImplReport = {
        changes: (parsed?.changes as ImplReport["changes"]) || [],
        scope_violations: (parsed?.scope_violations as string[]) || [],
        tests_added: (parsed?.tests_added as string[]) || [],
        notes: (parsed?.notes as string) || (parsed ? "" : `LLM 응답에서 JSON 추출 실패, 원본 길이: ${response.length}자`),
        terminal: buildTerminalLogFromEvents(events)
      };
      const changedPaths = implReport.changes.map((c) => c.path).filter(Boolean);
      const diff = await getGitDiff(cwd, changedPaths.length > 0 ? changedPaths : undefined);
      implReport.diff = diff;

      const hasViolations = implReport.scope_violations.length > 0;

      return {
        phase: "execute",
        implReport,
        activityLog: [
          logEntry(
            `코드 변경 완료 — ${implReport.changes.length}개 파일 변경${hasViolations ? `, 스코프 위반 ${implReport.scope_violations.length}건` : ""}`,
            hasViolations ? "warning" : "success"
          )
        ]
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // 이유: 실행 실패 시에도 빈 리포트로 진행하여 verify에서 FAIL 판정을 받도록 한다.
      return {
        phase: "execute",
        implReport: {
          changes: [],
          scope_violations: [],
          tests_added: [],
          notes: `실행 중 오류 발생: ${msg}`,
          terminal: error instanceof CliExecutionError
            ? buildTerminalLogFromEvents(error.events, msg)
            : buildTerminalLogFromEvents([], msg),
          diff: null
        },
        activityLog: [logEntry(`코드 변경 오류 — ${msg}`, "warning")]
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
