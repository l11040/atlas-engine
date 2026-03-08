// 책임: 커밋 후 전체 테스트 실행 및 회귀 검증을 수행한다.

import type { TaskGraphStateType } from "../state";
import type { VerificationCheck, VerificationResult } from "../../../../../../shared/ipc";
import { CliLlm } from "../../../cli-llm";
import { extractJson } from "../../shared/utils";
import { getSettings } from "../../../../config/settings";

// 목적: LLM(allowTools: true)으로 전체 빌드/테스트를 실행하여 회귀를 검출한다.
export async function postVerify(state: TaskGraphStateType): Promise<Partial<TaskGraphStateType>> {
  try {
    const settings = getSettings();
    const { task } = state;

    // 이유: verify_cmd가 없으면 post-verify도 스킵한다.
    if (!task.verify_cmd) {
      return {};
    }

    const llm = new CliLlm({
      provider: settings.activeProvider,
      cwd: settings.defaultCwd,
      allowTools: true,
      permissionMode: settings.cli.permissionMode,
      timeoutMs: settings.cli.timeoutMs
    });

    const prompt = buildPostVerifyPrompt(task);
    const { text } = await llm.invokeWithEvents(prompt);

    const raw = extractJson(text);
    const parsed = JSON.parse(raw) as {
      checks?: VerificationCheck[];
      failure_reasons?: string[];
    };

    const checks: VerificationCheck[] = Array.isArray(parsed.checks) ? parsed.checks : [];
    const failureReasons: string[] = Array.isArray(parsed.failure_reasons) ? parsed.failure_reasons : [];
    const allPassed = checks.length > 0 && checks.every((c) => c.passed);

    const verification: VerificationResult = {
      verdict: allPassed ? "pass" : "fail",
      checks,
      failure_reasons: failureReasons
    };

    return { verification };
  } catch (err) {
    return { error: `post-verify 실패: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function buildPostVerifyPrompt(task: TaskGraphStateType["task"]): string {
  return `You are performing a post-commit regression check. Verify that the committed changes do not break anything.

## Task
ID: ${task.id}
Title: ${task.title}

## Instructions
1. Run the full verification command: ${task.verify_cmd}
2. Check for any regressions — tests that previously passed but now fail.
3. Verify the project builds successfully.
4. Produce a JSON response matching this schema:

\`\`\`json
{
  "checks": [
    {
      "name": "string — check name (e.g. 'full_test_suite', 'build', 'regression')",
      "passed": true,
      "detail": "string — description of result"
    }
  ],
  "failure_reasons": ["string — each regression or failure found, empty if all pass"]
}
\`\`\`

Run the command, analyze the output, then respond ONLY with the JSON object.`;
}
