// 책임: 요구사항과 위험 평가를 기반으로 실행 계획을 생성한다.

import { CliLlm } from "../../../cli-llm";
import { getSettings } from "../../../../config/settings";
import { extractJson } from "../../shared/utils";
import type { ExecutionPlan } from "../../../../../../shared/ipc";
import type { PipelineStateType } from "../state";

const SYSTEM_PROMPT = `You are a senior software architect creating a detailed execution plan for a development task. Given the parsed requirements and risk assessment, produce a concrete, actionable plan with task units.

You MUST respond with a single JSON object matching this exact schema:

{
  "tasks": [
    {
      "id": "T-1",
      "title": "Short task title",
      "description": "Detailed description of what to implement",
      "linked_ac_ids": ["AC-1", "AC-2"],
      "deps": [],
      "scope": {
        "editable_paths": ["src/features/...", "src/lib/..."],
        "forbidden_paths": ["src/components/ui/...", "node_modules/..."]
      },
      "verify_cmd": "npm test -- --grep 'test name'"
    }
  ],
  "execution_order": ["T-1", "T-2", "T-3"]
}

Rules for creating tasks:

1. Task Granularity:
   - Each task should be a single, focused unit of work completable by an AI coding agent
   - Aim for tasks that touch 1-3 files each
   - Split large changes into smaller, independently verifiable tasks

2. Task IDs: Use sequential "T-1", "T-2", etc.

3. linked_ac_ids: Link each task to the acceptance criteria it fulfills. Every AC should be covered by at least one task.

4. deps: List task IDs that must be completed before this task. Use an empty array for tasks with no dependencies.

5. scope:
   - "editable_paths": Glob patterns for files the agent is allowed to create or modify
   - "forbidden_paths": Glob patterns for files the agent must NOT modify (e.g., generated files, config that shouldn't change, UI library internals)
   - Be specific — use actual file paths or narrow glob patterns based on the project structure

6. verify_cmd: A shell command to verify the task is correctly implemented. Prefer:
   - Unit test commands: "npm test -- --grep '...'" or "npx vitest run src/..."
   - Type checks: "npx tsc --noEmit"
   - Lint checks: "npx eslint src/..."
   - Build checks: "npm run build"
   - Combine multiple: "npm run typecheck && npm test"

7. execution_order: Topologically sorted list of all task IDs respecting dependencies.

8. Risk-aware planning:
   - If the risk assessment indicates "high" risk factors, add explicit verification tasks
   - If there are specification gaps, add a preliminary task to document assumptions
   - For complex dependency chains, keep the critical path as short as possible

Respond ONLY with the JSON object, no additional text.`;

// 목적: LLM을 사용하여 요구사항·위험 평가 기반의 ExecutionPlan을 생성한다.
export async function plan(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  if (!state.parsedRequirements) {
    return { error: "실행 계획을 생성할 파싱된 요구사항이 없습니다." };
  }

  const settings = getSettings();
  const llm = new CliLlm({
    provider: settings.activeProvider,
    cwd: settings.defaultCwd || process.cwd(),
    allowTools: false,
    timeoutMs: settings.cli.timeoutMs
  });

  try {
    const context = [
      "## Parsed Requirements",
      JSON.stringify(state.parsedRequirements, null, 2),
      "",
      "## Risk Assessment",
      state.riskAssessment
        ? JSON.stringify(state.riskAssessment, null, 2)
        : "No risk assessment available — proceed with standard planning.",
      "",
      "## Original Ticket Description",
      state.description || "(not available)"
    ].join("\n");

    const response = await llm.invoke(
      `${SYSTEM_PROMPT}\n\n---\n\nCreate an execution plan for:\n\n${context}`
    );

    const jsonStr = extractJson(response);
    const parsed: ExecutionPlan = JSON.parse(jsonStr);

    // 주의: 필수 필드 존재 여부를 검증한다.
    if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
      return { error: "LLM 응답에 유효한 tasks 배열이 없습니다." };
    }

    if (!Array.isArray(parsed.execution_order) || parsed.execution_order.length === 0) {
      return { error: "LLM 응답에 유효한 execution_order 배열이 없습니다." };
    }

    // 주의: execution_order의 모든 ID가 tasks에 존재하는지 검증한다.
    const taskIds = new Set(parsed.tasks.map((t) => t.id));
    for (const orderId of parsed.execution_order) {
      if (!taskIds.has(orderId)) {
        return { error: `execution_order에 존재하지 않는 task ID: ${orderId}` };
      }
    }

    return { executionPlan: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `실행 계획 생성 실패: ${message}` };
  }
}
