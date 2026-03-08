// 책임: 실패 사유 기반으로 코드를 수정한다.

import type { TaskGraphStateType } from "../state";
import type { ChangeSet } from "../../../../../../shared/ipc";
import { CliLlm } from "../../../cli-llm";
import { getSettings } from "../../../../config/settings";
import { getGitDiff } from "../../../../git/diff";

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
    await llm.invokeWithEvents(prompt);

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
      diff: diffResult.files.length > 0
        ? diffResult.files.map((f) => f.hunks.map((h) => h.header).join("\n")).join("\n")
        : null,
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
  const failureReasons = verification?.failure_reasons.join("\n- ") ?? "unknown";
  const failedChecks = verification?.checks
    .filter((c) => !c.passed)
    .map((c) => `- ${c.name}: ${c.detail}`)
    .join("\n") ?? "";

  const currentChanges = changeSets
    ? changeSets.changes.map((c) => `- ${c.action} ${c.path}`).join("\n")
    : "No previous changes.";

  const scopeSection = task.scope.editable_paths.length > 0
    ? `\nEditable paths: ${task.scope.editable_paths.join(", ")}`
    : "";
  const forbiddenSection = task.scope.forbidden_paths.length > 0
    ? `\nForbidden paths (DO NOT modify): ${task.scope.forbidden_paths.join(", ")}`
    : "";

  return `You are fixing code that failed verification. Address ALL failure reasons.

## Task
ID: ${task.id}
Title: ${task.title}
Description: ${task.description}

## Scope Constraints${scopeSection}${forbiddenSection}

## Previous Changes
${currentChanges}

## Verification Failures
Reasons:
- ${failureReasons}

Failed Checks:
${failedChecks}

## Instructions
1. Read the relevant source files to understand what went wrong.
2. Fix ALL the issues listed in the verification failures above.
3. Stay strictly within the allowed scope.
4. Ensure the code compiles and tests pass after your fixes.
5. Make minimal, targeted fixes — do not rewrite unrelated code.`;
}

function mapDiffStatus(status: "added" | "modified" | "deleted" | "renamed"): "create" | "modify" | "delete" {
  switch (status) {
    case "added": return "create";
    case "deleted": return "delete";
    default: return "modify";
  }
}

function detectScopeViolations(
  changedPaths: string[],
  editablePaths: string[],
  forbiddenPaths: string[]
): string[] {
  const violations: string[] = [];

  for (const filePath of changedPaths) {
    for (const forbidden of forbiddenPaths) {
      if (filePath.startsWith(forbidden) || filePath === forbidden) {
        violations.push(`Forbidden path modified: ${filePath}`);
      }
    }

    if (editablePaths.length > 0) {
      const withinScope = editablePaths.some(
        (allowed) => filePath.startsWith(allowed) || filePath === allowed
      );
      if (!withinScope) {
        violations.push(`Out of scope: ${filePath}`);
      }
    }
  }

  return violations;
}
