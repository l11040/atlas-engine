// 책임: 요구사항과 위험 평가를 기반으로 실행 계획을 생성한다.

import { CliLlm } from "../../../cli-llm";
import { getSettings } from "../../../../config/settings";
import { safeParseJson } from "../../shared/utils";
import { ExecutionPlanSchema } from "../../shared/schemas";
import type { ExecutionPlan } from "../../../../../../shared/ipc";
import type { PipelineStateType } from "../state";
import { appendRunCliEvent } from "../../../../automation/run-log-service";

const SYSTEM_PROMPT = `당신은 시니어 소프트웨어 아키텍트입니다. 파싱된 요구사항과 위험 평가를 기반으로 구체적이고 실행 가능한 계획을 수립하세요.

**중요: title, description, validation_strategy, rollback_strategy 등 모든 텍스트 값은 반드시 한글로 작성하세요. 코드 경로, 명령어, ID만 영어를 허용합니다.**

반드시 아래 스키마에 맞는 단일 JSON 객체로 응답하세요:

{
  "tasks": [
    {
      "id": "T-1",
      "title": "한글로 간략 제목",
      "description": "한글로 상세 구현 설명",
      "linked_ac_ids": ["AC-1", "AC-2"],
      "deps": [],
      "scope": {
        "editable_paths": ["src/features/...", "src/lib/..."],
        "forbidden_paths": ["src/components/ui/...", "node_modules/..."]
      },
      "verify_cmd": "npm test -- --grep 'test name'"
    }
  ],
  "execution_order": ["T-1", "T-2", "T-3"],
  "validation_strategy": "한글로 작성",
  "rollback_strategy": "한글로 작성"
}

작업 생성 규칙:

1. 작업 세분화:
   - 각 작업은 AI 코딩 에이전트가 완료할 수 있는 단일하고 집중된 작업 단위여야 합니다
   - 작업당 1~3개 파일을 목표로 합니다
   - 큰 변경은 독립적으로 검증 가능한 작은 작업으로 분할합니다

2. 작업 ID: "T-1", "T-2" 등 순차적으로 사용합니다.

3. linked_ac_ids: 각 작업을 충족하는 인수 기준에 연결합니다. 모든 AC가 최소 하나의 작업에 커버되어야 합니다.

4. deps: 이 작업 전에 완료해야 하는 작업 ID를 나열합니다. 의존성이 없으면 빈 배열을 사용합니다.

5. scope:
   - "editable_paths": 에이전트가 생성/수정할 수 있는 파일의 Glob 패턴
   - "forbidden_paths": 에이전트가 절대 수정하면 안 되는 파일의 Glob 패턴
   - 프로젝트 구조 기반으로 구체적인 경로나 좁은 Glob 패턴을 사용합니다

6. verify_cmd: 작업이 올바르게 구현되었는지 검증할 셸 명령어

7. execution_order: 의존성을 고려한 위상 정렬된 모든 작업 ID 목록

8. 위험 기반 계획: 고위험 요소가 있으면 명시적 검증 작업을 추가합니다

9. validation_strategy: 종단 간 검증 범위를 요약합니다 (테스트, 린트, 타입체크, 수동 확인)

10. rollback_strategy: 배포/검증 실패 시 실제적인 롤백 단계를 설명합니다

JSON 객체만 응답하세요. 추가 텍스트는 넣지 마세요.`;

// 목적: LLM을 사용하여 요구사항·위험 평가 기반의 ExecutionPlan을 생성한다.
export async function plan(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  if (!state.parsedRequirements) {
    return { error: "실행 계획을 생성할 파싱된 요구사항이 없습니다." };
  }

  const settings = getSettings();
  const llm = new CliLlm({
    provider: settings.activeProvider,
    cwd: settings.defaultCwd || process.cwd(),
    allowTools: false,
    timeoutMs: settings.cli.timeoutMs
  });

  try {
    const context = [
      "## Parsed Requirements",
      JSON.stringify(state.parsedRequirements, null, 2),
      "",
      "## Risk Assessment",
      state.riskAssessment
        ? JSON.stringify(state.riskAssessment, null, 2)
        : "No risk assessment available — proceed with standard planning.",
      "",
      "## Original Ticket Description",
      state.description || "(not available)"
    ].join("\n");

    const { text } = await llm.invokeWithEvents(
      `${SYSTEM_PROMPT}\n\n---\n\nCreate an execution plan for:\n\n${context}`,
      {
        onEvent: (event) => {
          appendRunCliEvent({
            step: "plan",
            node: "plan",
            event
          });
        }
      }
    );

    const result = safeParseJson(text, ExecutionPlanSchema);
    if (!result.success) {
      return { error: `실행 계획 응답 파싱 실패: ${result.error}` };
    }

    const parsed = result.data as ExecutionPlan;

    // 주의: 필수 필드 존재 여부를 추가 검증한다.
    if (parsed.tasks.length === 0) {
      return { error: "LLM 응답에 유효한 tasks 배열이 없습니다." };
    }

    if (parsed.execution_order.length === 0) {
      return { error: "LLM 응답에 유효한 execution_order 배열이 없습니다." };
    }

    if (!parsed.validation_strategy.trim()) {
      return { error: "LLM 응답에 validation_strategy가 없습니다." };
    }

    if (!parsed.rollback_strategy.trim()) {
      return { error: "LLM 응답에 rollback_strategy가 없습니다." };
    }

    // 주의: execution_order의 모든 ID가 tasks에 존재하는지 검증한다.
    const taskIds = new Set(parsed.tasks.map((t) => t.id));
    for (const orderId of parsed.execution_order) {
      if (!taskIds.has(orderId)) {
        return { error: `execution_order에 존재하지 않는 task ID: ${orderId}` };
      }
    }

    return { executionPlan: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `실행 계획 생성 실패: ${message}` };
  }
}
