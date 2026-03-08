// 책임: 변경 이유, AC 대응 관계, 위험 노트를 생성한다.

import type { TaskGraphStateType } from "../state";
import type { ChangeExplanation } from "../../../../../../shared/ipc";
import { CliLlm } from "../../../cli-llm";
import { extractJson } from "../../shared/utils";
import { getSettings } from "../../../../config/settings";

// 목적: LLM(allowTools: false)으로 변경 사항을 분석하여 구조화된 설명을 생성한다.
export async function explain(state: TaskGraphStateType): Promise<Partial<TaskGraphStateType>> {
  try {
    const settings = getSettings();
    const { task, changeSets } = state;

    if (!changeSets || changeSets.changes.length === 0) {
      return {
        explanation: {
          summary: "No changes were made.",
          change_reasons: [],
          risk_notes: []
        }
      };
    }

    const llm = new CliLlm({
      provider: settings.activeProvider,
      cwd: settings.defaultCwd,
      allowTools: false,
      permissionMode: settings.cli.permissionMode,
      timeoutMs: settings.cli.timeoutMs
    });

    const prompt = buildExplainPrompt(task, changeSets);
    const { text } = await llm.invokeWithEvents(prompt);

    const raw = extractJson(text);
    const parsed = JSON.parse(raw) as ChangeExplanation;

    // 주의: LLM 응답에 필수 필드가 누락될 수 있으므로 기본값을 보장한다.
    const explanation: ChangeExplanation = {
      summary: parsed.summary ?? "",
      change_reasons: Array.isArray(parsed.change_reasons) ? parsed.change_reasons : [],
      risk_notes: Array.isArray(parsed.risk_notes) ? parsed.risk_notes : []
    };

    return { explanation };
  } catch (err) {
    return { error: `explain 실패: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function buildExplainPrompt(
  task: TaskGraphStateType["task"],
  changeSets: NonNullable<TaskGraphStateType["changeSets"]>
): string {
  const changesDesc = changeSets.changes
    .map((c) => `- ${c.action} ${c.path} (${c.diff_summary})`)
    .join("\n");

  return `You are a code reviewer. Analyze the following code changes and produce a structured explanation.

## Task Context
ID: ${task.id}
Title: ${task.title}
Description: ${task.description}
Linked AC IDs: ${task.linked_ac_ids.join(", ") || "none"}

## Changes Made
${changesDesc}

${changeSets.diff ? `## Diff\n${changeSets.diff}` : ""}

${changeSets.scope_violations.length > 0 ? `## Scope Violations\n${changeSets.scope_violations.join("\n")}` : ""}

## Instructions
Produce a JSON response matching this schema:

\`\`\`json
{
  "summary": "string — brief overall summary of what changed and why",
  "change_reasons": [
    {
      "path": "string — file path",
      "reason": "string — why this file was changed",
      "linked_ac_ids": ["string — which acceptance criteria this change addresses"]
    }
  ],
  "risk_notes": ["string — potential risks or concerns about these changes"]
}
\`\`\`

Map each changed file to the acceptance criteria it addresses using the linked_ac_ids from the task.
Include risk notes for scope violations, large changes, or potentially breaking modifications.
Respond ONLY with the JSON object.`;
}
