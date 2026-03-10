// 책임: 검증 명령 실행 및 설계 검증 체크를 수행한다.

import type { TaskGraphStateType } from "../state";
import type { VerificationCheck, VerificationResult } from "../../../../../../shared/ipc";
import { CliLlm } from "../../../cli-llm";
import { safeParseJson } from "../../shared/utils";
import { VerificationResultSchema } from "../../shared/schemas";
import { getSettings } from "../../../../config/settings";
import { normalizeChecks } from "../change-utils";
import { appendRunCliEvent, appendRunLogEntry } from "../../../../automation/run-log-service";

const SEMANTIC_CHECKS = [
  "requirement_coverage",
  "unnecessary_changes",
  "regression_risk",
  "diff_explanation_alignment",
  "policy_rules",
  "test_scenarios"
] as const;

type SemanticCheckName = typeof SEMANTIC_CHECKS[number];

// 목적: 실패 시 실제로 verdict를 fail로 만드는 핵심 체크. 나머지는 advisory(경고만, 차단 안 함).
const BLOCKING_CHECKS = new Set<string>([
  "scope_check",
  "verify_cmd",
  "requirement_coverage"
]);

// 목적: LLM(allowTools: true)으로 verify_cmd 실행 + 6개 정적 체크를 수행한다.
export async function verify(state: TaskGraphStateType): Promise<Partial<TaskGraphStateType>> {
  try {
    const settings = getSettings();
    const { task, changeSets } = state;
    const checks: VerificationCheck[] = [];
    const failureReasons: string[] = [];

    if (changeSets && changeSets.scope_violations.length > 0) {
      checks.push({
        name: "scope_check",
        passed: false,
        detail: `스코프 위반: ${changeSets.scope_violations.join(", ")}`
      });
      failureReasons.push(...changeSets.scope_violations);
    } else {
      checks.push({
        name: "scope_check",
        passed: true,
        detail: "모든 변경이 허용된 스코프 내에 있습니다."
      });
    }

    const llm = new CliLlm({
      provider: settings.activeProvider,
      cwd: settings.defaultCwd,
      allowTools: true,
      permissionMode: settings.cli.permissionMode,
      timeoutMs: settings.cli.timeoutMs
    });

    const prompt = buildVerifyPrompt(state);
    appendRunLogEntry({
      level: "info",
      step: "execution",
      node: "verify",
      message: "검증을 위한 LLM 호출 시작"
    });

    const { text } = await llm.invokeWithEvents(prompt, {
      onEvent: (event) => {
        appendRunCliEvent({
          step: "execution",
          node: "verify",
          taskId: task.id,
          event
        });
      }
    });

    appendRunLogEntry({
      level: "info",
      step: "execution",
      node: "verify",
      message: `LLM 응답 수신 완료 (${text.length}자)`
    });

    const parseResult = safeParseJson(text, VerificationResultSchema);
    if (!parseResult.success) {
      return { error: `검증 응답 파싱 실패: ${parseResult.error}` };
    }

    const parsedChecks: VerificationCheck[] = parseResult.data.checks ?? [];
    const parsedFailures: string[] = parseResult.data.failure_reasons ?? [];

    const verifyCmdCheck = task.verify_cmd
      ? parsedChecks.find((check) => check.name === "verify_cmd") ?? {
          name: "verify_cmd",
          passed: false,
          detail: "모델 출력에 verify_cmd 체크가 누락되었습니다."
        }
      : {
          name: "verify_cmd",
          passed: true,
          detail: "검증 명령이 지정되지 않아 명령 실행을 건너뛰었습니다."
        };

    const semanticChecks = normalizeChecks(
      parsedChecks.filter((check): check is VerificationCheck => {
        return SEMANTIC_CHECKS.includes(check.name as SemanticCheckName);
      }),
      [...SEMANTIC_CHECKS]
    );

    checks.push(verifyCmdCheck, ...semanticChecks);
    failureReasons.push(...parsedFailures);

    for (const check of checks) {
      if (!check.passed) failureReasons.push(`${check.name}: ${check.detail}`);
    }

    const dedupedFailureReasons = [...new Set(failureReasons)];
    // 이유: blocking 체크만 실패 시 차단한다. advisory 체크(unnecessary_changes, regression_risk 등)는
    // 실패해도 검수자에게 경고만 표시하고 다음 단계로 진행한다.
    const blockingFailed = checks.some((check) => !check.passed && BLOCKING_CHECKS.has(check.name));
    const verification: VerificationResult = {
      verdict: blockingFailed ? "fail" : "pass",
      checks,
      failure_reasons: dedupedFailureReasons
    };

    return { verification };
  } catch (err) {
    return { error: `verify 실패: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function buildVerifyPrompt(state: TaskGraphStateType): string {
  const { task, changeSets, explanation, parsedRequirements } = state;
  const changedFiles = changeSets
    ? changeSets.changes.map((c) => `- ${c.action} ${c.path} (${c.diff_summary})`).join("\n")
    : "No changes recorded.";

  const acceptanceCriteria = parsedRequirements?.acceptance_criteria
    ?.map((ac) => `- ${ac.id}: ${ac.description} (testable: ${ac.testable})`)
    .join("\n") || "- none";
  const policyRules = parsedRequirements?.policy_rules?.map((rule) => `- ${rule}`).join("\n") || "- none";
  const testScenarios = parsedRequirements?.test_scenarios
    ?.map((scenario) => `- ${scenario.id}: ${scenario.description} (AC: ${scenario.linked_ac_ids.join(", ") || "none"})`)
    .join("\n") || "- none";
  const changeReasons = explanation?.change_reasons
    ?.map((entry) => `- ${entry.path}: ${entry.reason} (AC: ${entry.linked_ac_ids.join(", ") || "none"})`)
    .join("\n") || "- none";

  return `You are a pragmatic verification agent. Focus on correctness and requirement coverage. Minor style issues or theoretical risks should not cause failures.

## Task
ID: ${task.id}
Title: ${task.title}
Description: ${task.description}
Linked AC IDs: ${task.linked_ac_ids.join(", ") || "none"}

## Acceptance Criteria
${acceptanceCriteria}

## Policy Rules
${policyRules}

## Test Scenarios
${testScenarios}

## Change Explanation
Summary: ${explanation?.summary ?? "(none)"}
Implementation rationale: ${explanation?.implementation_rationale ?? "(none)"}
Change reasons:
${changeReasons}

## Changed Files
${changedFiles}

${changeSets?.diff ? `## Unified Diff\n${changeSets.diff}\n` : ""}

## Verification Command
${task.verify_cmd ?? "(none)"}

## Required checks
Return checks for ALL names below:
- verify_cmd
- requirement_coverage
- unnecessary_changes
- regression_risk
- diff_explanation_alignment
- policy_rules
- test_scenarios

Check meanings (BLOCKING = causes failure, ADVISORY = warning only):
- verify_cmd [BLOCKING]: Run verify_cmd when provided. Fail only if command exits non-zero or has clear build/syntax errors. Test failures alone should NOT fail this check unless they indicate broken compilation.
- requirement_coverage [BLOCKING]: Changes satisfy linked acceptance criteria and do not miss core requirements.
- unnecessary_changes [ADVISORY]: No unrelated churn or scope creep. Be lenient — minor related refactoring is acceptable.
- regression_risk [ADVISORY]: No new obvious regressions introduced by the diff. Only fail for clear, concrete regressions.
- diff_explanation_alignment [ADVISORY]: Explanation matches actual diff content.
- policy_rules [ADVISORY]: Changes respect listed policy rules. Minor deviations are acceptable.
- test_scenarios [ADVISORY]: Proposed behavior is testable against listed scenarios.

Respond with ONLY this JSON object:
\`\`\`json
{
  "checks": [
    { "name": "verify_cmd", "passed": true, "detail": "..." },
    { "name": "requirement_coverage", "passed": true, "detail": "..." },
    { "name": "unnecessary_changes", "passed": true, "detail": "..." },
    { "name": "regression_risk", "passed": true, "detail": "..." },
    { "name": "diff_explanation_alignment", "passed": true, "detail": "..." },
    { "name": "policy_rules", "passed": true, "detail": "..." },
    { "name": "test_scenarios", "passed": true, "detail": "..." }
  ],
  "failure_reasons": ["..."]
}
\`\`\`

Do not omit any required check name.`;
}
