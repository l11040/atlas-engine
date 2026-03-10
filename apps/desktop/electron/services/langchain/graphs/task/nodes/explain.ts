// 책임: 변경 이유, AC 대응 관계, 위험 노트를 생성한다.

import type { TaskGraphStateType } from "../state";
import type { ChangeExplanation } from "../../../../../../shared/ipc";
import { CliLlm } from "../../../cli-llm";
import { safeParseJson } from "../../shared/utils";
import { ChangeExplanationSchema } from "../../shared/schemas";
import { getSettings } from "../../../../config/settings";
import { appendRunCliEvent, appendRunLogEntry } from "../../../../automation/run-log-service";

// 목적: LLM(allowTools: false)으로 변경 사항을 분석하여 구조화된 설명을 생성한다.
export async function explain(state: TaskGraphStateType): Promise<Partial<TaskGraphStateType>> {
  try {
    const settings = getSettings();
    const { task, changeSets } = state;

    if (!changeSets || changeSets.changes.length === 0) {
      return {
        explanation: {
          summary: "변경 사항이 없습니다.",
          implementation_rationale: "구현이 필요하지 않았습니다.",
          change_reasons: [],
          policy_considerations: [],
          alternatives_considered: [],
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
    appendRunLogEntry({
      level: "info",
      step: "execution",
      node: "explain",
      message: "변경 설명 생성을 위한 LLM 호출 시작"
    });

    const { text } = await llm.invokeWithEvents(prompt, {
      onEvent: (event) => {
        appendRunCliEvent({
          step: "execution",
          node: "explain",
          taskId: task.id,
          event
        });
      }
    });

    appendRunLogEntry({
      level: "info",
      step: "execution",
      node: "explain",
      message: `LLM 응답 수신 완료 (${text.length}자)`
    });

    const result = safeParseJson(text, ChangeExplanationSchema);
    if (!result.success) {
      return { error: `변경 설명 응답 파싱 실패: ${result.error}` };
    }

    return { explanation: result.data as ChangeExplanation };
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

  return `당신은 코드 리뷰어입니다. 아래 코드 변경 사항을 분석하고 구조화된 설명을 생성하세요.

**중요: 모든 텍스트 값(summary, reason, risk_notes 등)은 반드시 한글로 작성하세요. 파일 경로와 AC ID만 영어를 허용합니다.**

## 작업 컨텍스트
ID: ${task.id}
제목: ${task.title}
설명: ${task.description}
연결된 AC ID: ${task.linked_ac_ids.join(", ") || "없음"}

## 변경 사항
${changesDesc}

${changeSets.diff ? `## Diff\n${changeSets.diff}` : ""}

${changeSets.scope_violations.length > 0 ? `## 스코프 위반\n${changeSets.scope_violations.join("\n")}` : ""}

## 지시사항
아래 스키마에 맞는 JSON 응답을 생성하세요:

\`\`\`json
{
  "summary": "변경된 내용과 이유를 한글로 간략히 요약",
  "implementation_rationale": "이 구현 방식을 선택한 이유를 한글로",
  "change_reasons": [
    {
      "path": "파일 경로",
      "reason": "이 파일을 변경한 이유를 한글로",
      "linked_ac_ids": ["이 변경이 해결하는 인수 기준 ID"]
    }
  ],
  "policy_considerations": [
    "고려한 정책/규칙/제약과 준수 방법을 한글로"
  ],
  "alternatives_considered": [
    "고려했지만 선택하지 않은 대안을 한글로"
  ],
  "risk_notes": [
    "잠재 위험. 각 항목에 심각도 접두사 사용: HIGH:, MEDIUM:, LOW: 한글로 작성"
  ]
}
\`\`\`

변경된 각 파일을 작업의 linked_ac_ids를 사용하여 인수 기준에 매핑하세요.
스코프 위반, 대규모 변경, 잠재적 브레이킹 수정에 대해 위험 노트를 포함하세요.
JSON 객체만 응답하세요.`;
}
