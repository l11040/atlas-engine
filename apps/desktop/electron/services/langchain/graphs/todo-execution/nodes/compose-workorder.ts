// 책임: WorkOrder 작성 노드. Todo를 Atlas 7-Section WorkOrder로 변환한다.
// 이유: v2.3 Section 9.2 — Orchestrator가 WorkOrder를 발행하고 AtlasHook이 검증한다.

import type { WorkOrder } from "../../../../../../shared/ipc";
import type { CliLlm } from "../../../cli-llm";
import { extractJson, logEntry } from "../../shared/utils";
import type { TodoExecutionState } from "../state";

// 목적: 모드별 evidence_required 매핑 (v2.3 Section 7).
function getEvidenceRequired(mode: string): string[] {
  if (mode === "fast") return ["test_pass_log"];
  if (mode === "strict") return ["test_pass_log", "lint_clean", "coverage_pct", "regression_check"];
  return ["test_pass_log", "lint_clean"];
}

// 목적: 모드별 retry budget (v2.3 Section 7).
function getMaxAttempt(mode: string): number {
  if (mode === "fast") return 2;
  if (mode === "strict") return 5;
  return 3;
}

function getTimeoutSeconds(mode: string): number {
  if (mode === "fast") return 60;
  if (mode === "strict") return 300;
  return 120;
}

function getRequiredTools(mode: string): string[] {
  if (mode === "strict") return ["Runner", "RepoAdapter", "CoverageTool"];
  return ["Runner", "RepoAdapter"];
}

export function createComposeWorkorderNode(llm: CliLlm) {
  return async (state: TodoExecutionState): Promise<Partial<TodoExecutionState>> => {
    const { todo, jiraKey, mode } = state;
    const maxAttempt = getMaxAttempt(mode);
    const evidenceRequired = getEvidenceRequired(mode);
    const timeoutSeconds = getTimeoutSeconds(mode);
    const requiredTools = getRequiredTools(mode);

    // 주의: "파일을 수정하지 마세요" 지시를 반복하여 CLI 에이전트의 도구 사용을 억제한다.
    const prompt = `[IMPORTANT] 파일을 수정하거나 명령을 실행하지 마세요. 오직 JSON만 출력하세요. 다른 설명 없이 JSON 코드 블록 하나만 응답하세요.

아래 Todo 정보를 기반으로 WorkOrder JSON을 생성하세요.

Todo: { "id": "${todo.id}", "title": "${todo.title}", "reason": "${todo.reason}", "route": "${todo.route}", "risk": "${todo.risk}", "deps": ${JSON.stringify(todo.deps)} }
jira_key: ${jiraKey}

아래 JSON 스키마를 채워서 응답하세요. 반드시 \`\`\`json 코드 블록으로 감싸세요:
\`\`\`json
{
  "schema_version": "2.3.3",
  "task": "Todo의 원자 작업을 구체적으로 설명",
  "expected_outcome": "완료 시 관측 가능한 결과",
  "required_tools": ["Runner", "RepoAdapter"],
  "must_do": ["반드시 수행할 항목"],
  "must_not": ["테스트 삭제 금지", "보안 파일 수정 금지", "테스트 스킵 플래그 추가 금지", "CI 설정 무력화 금지", "스냅샷 일괄 업데이트 금지"],
  "scope": { "editable_paths": ["수정 가능 경로"], "forbidden_paths": ["수정 금지 경로"] },
  "verify_cmd": "검증 명령어",
  "escalation_policy": "fast | standard | strict",
  "timeout_seconds": 120
}
\`\`\`

[IMPORTANT] 반드시 위 JSON 형식으로만 응답하세요. 파일을 읽거나 수정하지 마세요.`;

    try {
      const response = await llm.invoke(prompt);
      const parsed = safeParseJson(response) as Record<string, unknown> | null;
      const scope = (parsed?.scope as Record<string, unknown> | undefined) ?? {};
      const parsedEditable =
        toStringArray(scope.editable_paths) ??
        toStringArray(scope.editablePaths) ??
        toStringArray(parsed?.editable_paths) ??
        toStringArray(parsed?.editablePaths) ??
        [];
      const parsedForbidden =
        toStringArray(scope.forbidden_paths) ??
        toStringArray(scope.forbiddenPaths) ??
        toStringArray(parsed?.forbidden_paths) ??
        toStringArray(parsed?.forbiddenPaths) ??
        [];

      const woId = `wo-${todo.id}-att-${todo.attempt.n + 1}`;
      const workOrder: WorkOrder = {
        schema_version: "2.3.3",
        wo_id: woId,
        task: (parsed?.task as string) || todo.title,
        expected_outcome: (parsed?.expected_outcome as string) || (parsed?.expectedOutcome as string) || `${todo.title} 완료`,
        required_tools: toStringArray(parsed?.required_tools) ?? toStringArray(parsed?.requiredTools) ?? requiredTools,
        must_do: toStringArray(parsed?.must_do) ?? toStringArray(parsed?.mustDo) ?? [todo.title],
        must_not:
          toStringArray(parsed?.must_not) ??
          toStringArray(parsed?.mustNot) ??
          ["테스트 삭제", "보안 파일 수정", "테스트 스킵 플래그 추가", "CI 설정 무력화", "스냅샷 일괄 업데이트"],
        scope: {
          editable_paths: parsedEditable,
          forbidden_paths: parsedForbidden
        },
        verify_cmd: (parsed?.verify_cmd as string) || (parsed?.verifyCmd as string) || "npm test",
        evidence_required: evidenceRequired,
        mode,
        escalation_policy: (parsed?.escalation_policy as WorkOrder["escalation_policy"]) || mode,
        timeout_seconds: (parsed?.timeout_seconds as number) || timeoutSeconds,
        attempt: { n: todo.attempt.n + 1, max: maxAttempt },
        frozen: true,
        origin_todo_id: todo.id,
        retry_of_wo_id: null
      };

      return {
        phase: "workorder",
        workOrder,
        activityLog: [logEntry(`WorkOrder 작성 완료 — ${woId}: ${workOrder.task}`, "success")]
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // 이유: WorkOrder 생성 실패 시에도 기본값으로 진행하여 플로우를 중단하지 않는다.
      const woId = `wo-${todo.id}-att-${todo.attempt.n + 1}`;
      const fallbackWorkOrder: WorkOrder = {
        schema_version: "2.3.3",
        wo_id: woId,
        task: todo.title,
        expected_outcome: `${todo.title} 완료`,
        required_tools: requiredTools,
        must_do: [todo.title],
        must_not: ["테스트 삭제", "보안 파일 수정", "테스트 스킵 플래그 추가", "CI 설정 무력화", "스냅샷 일괄 업데이트"],
        scope: { editable_paths: [], forbidden_paths: [] },
        verify_cmd: "npm test",
        evidence_required: evidenceRequired,
        mode,
        escalation_policy: mode,
        timeout_seconds: timeoutSeconds,
        attempt: { n: todo.attempt.n + 1, max: maxAttempt },
        frozen: true,
        origin_todo_id: todo.id,
        retry_of_wo_id: null
      };

      return {
        phase: "workorder",
        workOrder: fallbackWorkOrder,
        activityLog: [logEntry(`WorkOrder LLM 파싱 실패, 기본값으로 생성 — ${msg}`, "warning")]
      };
    }
  };
}

// 목적: JSON 파싱을 안전하게 시도한다. 실패 시 null을 반환한다.
function safeParseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(extractJson(text));
  } catch {
    return null;
  }
}

function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}
