// 책임: CLI 에이전트에 코드 변경을 위임하고 git diff로 변경 사항을 캡처한다.

import type { TaskGraphStateType } from "../state";
import type { ChangeSet } from "../../../../../../shared/ipc";
import { CliLlm } from "../../../cli-llm";
import { getSettings } from "../../../../config/settings";
import { getGitDiff } from "../../../../git/diff";

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
    await llm.invokeWithEvents(prompt);

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
      diff: diffResult.files.length > 0
        ? diffResult.files.map((f) => f.hunks.map((h) => h.header).join("\n")).join("\n")
        : null,
      scope_violations: scopeViolations
    };

    return { changeSets };
  } catch (err) {
    return { error: `generate 실패: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function buildGeneratePrompt(task: TaskGraphStateType["task"]): string {
  const scopeSection = task.scope.editable_paths.length > 0
    ? `\nEditable paths: ${task.scope.editable_paths.join(", ")}`
    : "";
  const forbiddenSection = task.scope.forbidden_paths.length > 0
    ? `\nForbidden paths (DO NOT modify): ${task.scope.forbidden_paths.join(", ")}`
    : "";

  return `You are implementing a code change task. Follow the instructions precisely.

## Task
ID: ${task.id}
Title: ${task.title}
Description: ${task.description}

## Scope Constraints${scopeSection}${forbiddenSection}

## Acceptance Criteria References
Linked AC IDs: ${task.linked_ac_ids.join(", ") || "none"}

## Instructions
1. Read the relevant source files to understand the current codebase structure.
2. Implement the changes described above.
3. Stay strictly within the allowed scope. Do NOT modify files outside editable_paths.
4. Make minimal, focused changes that satisfy the task description.
5. Ensure the code compiles and follows existing conventions.`;
}

// 목적: diff 파일 상태를 ChangeSet action으로 매핑한다.
function mapDiffStatus(status: "added" | "modified" | "deleted" | "renamed"): "create" | "modify" | "delete" {
  switch (status) {
    case "added": return "create";
    case "deleted": return "delete";
    default: return "modify";
  }
}

// 목적: 변경된 파일이 editable_paths 밖이거나 forbidden_paths 안에 있으면 위반으로 판정한다.
function detectScopeViolations(
  changedPaths: string[],
  editablePaths: string[],
  forbiddenPaths: string[]
): string[] {
  const violations: string[] = [];

  for (const filePath of changedPaths) {
    // 주의: forbidden_paths 위반 검사
    for (const forbidden of forbiddenPaths) {
      if (filePath.startsWith(forbidden) || filePath === forbidden) {
        violations.push(`Forbidden path modified: ${filePath}`);
      }
    }

    // 주의: editable_paths가 지정된 경우, 해당 범위 밖 수정도 위반이다.
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
