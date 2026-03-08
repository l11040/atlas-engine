// 책임: 검증 명령 실행 및 4가지 체크(테스트, 린트, 스코프, 컴파일)를 수행한다.

import type { TaskGraphStateType } from "../state";
import type { VerificationCheck, VerificationResult } from "../../../../../../shared/ipc";
import { CliLlm } from "../../../cli-llm";
import { extractJson } from "../../shared/utils";
import { getSettings } from "../../../../config/settings";

// 목적: LLM(allowTools: true)으로 verify_cmd를 실행하고 결과를 분석하여 검증 판정을 내린다.
export async function verify(state: TaskGraphStateType): Promise<Partial<TaskGraphStateType>> {
  try {
    const settings = getSettings();
    const { task, changeSets } = state;

    const llm = new CliLlm({
      provider: settings.activeProvider,
      cwd: settings.defaultCwd,
      allowTools: true,
      permissionMode: settings.cli.permissionMode,
      timeoutMs: settings.cli.timeoutMs
    });

    // 목적: 스코프 위반은 LLM 호출 없이 즉시 실패 처리한다.
    const checks: VerificationCheck[] = [];
    const failureReasons: string[] = [];

    if (changeSets && changeSets.scope_violations.length > 0) {
      checks.push({
        name: "scope_check",
        passed: false,
        detail: `Scope violations: ${changeSets.scope_violations.join(", ")}`
      });
      failureReasons.push(...changeSets.scope_violations);
    } else {
      checks.push({
        name: "scope_check",
        passed: true,
        detail: "All changes within allowed scope."
      });
    }

    // 목적: verify_cmd가 있으면 CLI 에이전트로 실행하여 테스트/린트/컴파일 결과를 분석한다.
    if (task.verify_cmd) {
      const prompt = buildVerifyPrompt(task, changeSets);
      const { text } = await llm.invokeWithEvents(prompt);

      const raw = extractJson(text);
      const parsed = JSON.parse(raw) as {
        checks?: VerificationCheck[];
        failure_reasons?: string[];
      };

      if (Array.isArray(parsed.checks)) {
        checks.push(...parsed.checks);
      }
      if (Array.isArray(parsed.failure_reasons)) {
        failureReasons.push(...parsed.failure_reasons);
      }
    } else {
      // 이유: verify_cmd가 없으면 테스트/린트/컴파일 체크를 스킵으로 처리한다.
      checks.push({
        name: "verify_cmd",
        passed: true,
        detail: "No verify command specified; skipped."
      });
    }

    const allPassed = checks.every((c) => c.passed);
    const verification: VerificationResult = {
      verdict: allPassed ? "pass" : "fail",
      checks,
      failure_reasons: failureReasons
    };

    return { verification };
  } catch (err) {
    return { error: `verify 실패: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function buildVerifyPrompt(
  task: TaskGraphStateType["task"],
  changeSets: TaskGraphStateType["changeSets"]
): string {
  const changesDesc = changeSets
    ? changeSets.changes.map((c) => `- ${c.action} ${c.path}`).join("\n")
    : "No changes recorded.";

  return `You are a code verification agent. Run the verification command and analyze the results.

## Task
ID: ${task.id}
Title: ${task.title}

## Changed Files
${changesDesc}

## Verification Command
Run this command: ${task.verify_cmd}

## Instructions
1. Execute the verification command above.
2. Analyze the output for test failures, lint errors, and compilation errors.
3. Produce a JSON response matching this schema:

\`\`\`json
{
  "checks": [
    {
      "name": "string — check name (e.g. 'tests', 'lint', 'compile')",
      "passed": true,
      "detail": "string — description of result"
    }
  ],
  "failure_reasons": ["string — each reason for failure, empty if all pass"]
}
\`\`\`

Include separate checks for: tests, lint, compilation.
Respond ONLY with the JSON object after running the command.`;
}
