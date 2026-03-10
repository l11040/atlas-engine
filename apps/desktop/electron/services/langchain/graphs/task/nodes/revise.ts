// 책임: 실패 사유 기반으로 코드를 수정한다.

import type { TaskGraphStateType } from "../state";
import type { ChangeSet } from "../../../../../../shared/ipc";
import { CliLlm } from "../../../cli-llm";
import { getSettings } from "../../../../config/settings";
import { getGitDiff } from "../../../../git/diff";
import { appendRunCliEvent, appendRunLogEntry } from "../../../../automation/run-log-service";
import {
  buildFailureReport,
  buildUnifiedDiff,
  detectScopeViolations,
  mapDiffStatus,
  summarizeTaskScope
} from "../change-utils";

// 목적: LLM(allowTools: true)으로 verification failure_reasons를 기반으로 코드를 수정한다.
export async function revise(state: TaskGraphStateType): Promise<Partial<TaskGraphStateType>> {
  try {
    const settings = getSettings();
    const cwd = settings.defaultCwd;
    const { task, verification, changeSets } = state;

    const llm = new CliLlm({
      provider: settings.activeProvider,
      cwd,
      allowTools: true,
      permissionMode: settings.cli.permissionMode,
      timeoutMs: settings.cli.timeoutMs
    });

    const prompt = buildRevisePrompt(task, verification, changeSets);
    appendRunLogEntry({
      level: "info",
      step: "execution",
      node: "revise",
      message: "코드 수정을 위한 LLM 호출 시작"
    });

    await llm.invokeWithEvents(prompt, {
      onEvent: (event) => {
        appendRunCliEvent({
          step: "execution",
          node: "revise",
          taskId: task.id,
          event
        });
      }
    });

    appendRunLogEntry({
      level: "info",
      step: "execution",
      node: "revise",
      message: "LLM 코드 수정 완료"
    });

    // 목적: 수정 후 diff를 다시 캡처한다.
    const diffResult = await getGitDiff(cwd);

    if (diffResult.error) {
      return { error: `revise git diff 실패: ${diffResult.error}` };
    }

    const scopeViolations = detectScopeViolations(
      diffResult.files.map((f) => f.filePath),
      task.scope.editable_paths,
      task.scope.forbidden_paths
    );

    const updatedChangeSets: ChangeSet = {
      changes: diffResult.files.map((f) => ({
        path: f.filePath,
        action: mapDiffStatus(f.status),
        diff_summary: `+${f.additions} -${f.deletions}`
      })),
      diff: buildUnifiedDiff(diffResult.files),
      scope_violations: scopeViolations
    };

    return {
      changeSets: updatedChangeSets,
      attempt: { current: state.attempt.current + 1, max: state.attempt.max }
    };
  } catch (err) {
    return { error: `revise 실패: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function buildRevisePrompt(
  task: TaskGraphStateType["task"],
  verification: TaskGraphStateType["verification"],
  changeSets: TaskGraphStateType["changeSets"]
): string {
  const failureReport = buildFailureReport(verification);

  const currentChanges = changeSets
    ? changeSets.changes.map((c) => `- ${c.action} ${c.path}`).join("\n")
    : "No previous changes.";

  const scopeSection = summarizeTaskScope(task);

  return `You are fixing code that failed verification. Address ALL failure reasons.

## Task
ID: ${task.id}
Title: ${task.title}
Description: ${task.description}

## Scope Constraints
${scopeSection}

## Previous Changes
${currentChanges}

## Verification Failures
${failureReport}

## Instructions
1. Read the relevant source files to understand what went wrong.
2. Fix ALL the issues listed in the verification failures above.
3. Stay strictly within the allowed scope.
4. Ensure the code compiles and tests pass after your fixes.
5. Make minimal, targeted fixes — do not rewrite unrelated code.`;
}
