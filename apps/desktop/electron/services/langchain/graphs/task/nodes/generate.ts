// 책임: CLI 에이전트에 코드 변경을 위임하고 git diff로 변경 사항을 캡처한다.

import type { TaskGraphStateType } from "../state";
import type { ChangeSet } from "../../../../../../shared/ipc";
import { CliLlm } from "../../../cli-llm";
import { getSettings } from "../../../../config/settings";
import { getGitDiff } from "../../../../git/diff";
import { appendRunCliEvent, appendRunLogEntry } from "../../../../automation/run-log-service";
import {
  buildUnifiedDiff,
  detectScopeViolations,
  mapDiffStatus,
  summarizeTaskScope
} from "../change-utils";

// 목적: LLM(allowTools: true)으로 코드를 생성하고, diff를 캡처하여 ChangeSet으로 반환한다.
export async function generate(state: TaskGraphStateType): Promise<Partial<TaskGraphStateType>> {
  try {
    const settings = getSettings();
    const cwd = settings.defaultCwd;
    const { task } = state;

    const llm = new CliLlm({
      provider: settings.activeProvider,
      cwd,
      allowTools: true,
      permissionMode: settings.cli.permissionMode,
      timeoutMs: settings.cli.timeoutMs
    });

    const prompt = buildGeneratePrompt(task);
    appendRunLogEntry({
      level: "info",
      step: "execution",
      node: "generate",
      message: "코드 생성을 위한 LLM 호출 시작"
    });

    await llm.invokeWithEvents(prompt, {
      onEvent: (event) => {
        appendRunCliEvent({
          step: "execution",
          node: "generate",
          taskId: task.id,
          event
        });
      }
    });

    appendRunLogEntry({
      level: "info",
      step: "execution",
      node: "generate",
      message: "LLM 코드 생성 완료"
    });

    // 목적: CLI 실행 후 git diff로 실제 변경 사항을 캡처한다.
    const diffResult = await getGitDiff(cwd);

    if (diffResult.error) {
      return { error: `git diff 실패: ${diffResult.error}` };
    }

    // 목적: editable_paths/forbidden_paths 기준으로 스코프 위반을 검출한다.
    const scopeViolations = detectScopeViolations(
      diffResult.files.map((f) => f.filePath),
      task.scope.editable_paths,
      task.scope.forbidden_paths
    );

    const changeSets: ChangeSet = {
      changes: diffResult.files.map((f) => ({
        path: f.filePath,
        action: mapDiffStatus(f.status),
        diff_summary: `+${f.additions} -${f.deletions}`
      })),
      diff: buildUnifiedDiff(diffResult.files),
      scope_violations: scopeViolations
    };

    return { changeSets };
  } catch (err) {
    return { error: `generate 실패: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function buildGeneratePrompt(task: TaskGraphStateType["task"]): string {
  const scopeSection = summarizeTaskScope(task);

  return `You are implementing a code change task. Follow the instructions precisely.

## Task
ID: ${task.id}
Title: ${task.title}
Description: ${task.description}

## Scope Constraints
${scopeSection}

## Acceptance Criteria References
Linked AC IDs: ${task.linked_ac_ids.join(", ") || "none"}

## Instructions
1. Read the relevant source files to understand the current codebase structure.
2. Implement the changes described above.
3. Stay strictly within the allowed scope. Do NOT modify files outside editable_paths.
4. Make minimal, focused changes that satisfy the task description.
5. Ensure the code compiles and follows existing conventions.`;
}
