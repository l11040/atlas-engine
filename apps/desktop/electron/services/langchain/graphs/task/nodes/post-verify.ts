// 책임: 커밋 후 전체 테스트 실행 및 회귀 검증을 수행한다.

import type { TaskGraphStateType } from "../state";
import type { VerificationCheck, VerificationResult } from "../../../../../../shared/ipc";
import { CliLlm } from "../../../cli-llm";
import { safeParseJson } from "../../shared/utils";
import { VerificationResultSchema } from "../../shared/schemas";
import { getSettings } from "../../../../config/settings";
import { appendRunCliEvent } from "../../../../automation/run-log-service";

// 목적: LLM(allowTools: true)으로 전체 빌드/테스트를 실행하여 회귀를 검출한다.
export async function postVerify(state: TaskGraphStateType): Promise<Partial<TaskGraphStateType>> {
  try {
    const settings = getSettings();
    const { task } = state;

    // 이유: verify_cmd가 없으면 post-verify도 스킵한다.
    if (!task.verify_cmd) {
      return {
        postVerification: {
          verdict: "pass",
          checks: [
            {
              name: "post_verify_cmd",
              passed: true,
              detail: "검증 명령이 지정되지 않아 post-verify를 건너뛰었습니다."
            }
          ],
          failure_reasons: []
        }
      };
    }

    const llm = new CliLlm({
      provider: settings.activeProvider,
      cwd: settings.defaultCwd,
      allowTools: true,
      permissionMode: settings.cli.permissionMode,
      timeoutMs: settings.cli.timeoutMs
    });

    const prompt = buildPostVerifyPrompt(task);
    const { text } = await llm.invokeWithEvents(prompt, {
      onEvent: (event) => {
        appendRunCliEvent({
          step: "execution",
          node: "post_verify",
          taskId: task.id,
          event
        });
      }
    });

    const parseResult = safeParseJson(text, VerificationResultSchema);
    if (!parseResult.success) {
      return { error: `post-verify 응답 파싱 실패: ${parseResult.error}` };
    }

    const checks: VerificationCheck[] = parseResult.data.checks ?? [];
    const failureReasons: string[] = parseResult.data.failure_reasons ?? [];
    const allPassed = checks.length > 0 && checks.every((c) => c.passed);

    const postVerification: VerificationResult = {
      verdict: allPassed ? "pass" : "fail",
      checks,
      failure_reasons: failureReasons
    };

    return { postVerification };
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
