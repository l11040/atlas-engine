// 책임: 선택된 phase에 해당하는 콘텐츠를 렌더링한다.

import { TicketCard } from "../phases/intake/ticket-card";
import { DorCheckCard } from "../phases/dor/dor-check-card";
import { TodoProgress } from "../phases/plan/todo-progress";
import type { PhaseData } from "../hooks/use-pipeline-orchestration";
import type { PipelinePhase, Ticket } from "@shared/ipc";

interface PhaseContentProps {
  viewPhase: PipelinePhase;
  phaseData: PhaseData;
  ticket: Ticket;
}

export function PhaseContent({ viewPhase, phaseData, ticket }: PhaseContentProps) {
  if (viewPhase === "idle" || viewPhase === "intake") {
    return <TicketCard ticket={ticket} />;
  }

  if (viewPhase === "dor") {
    return (
      <DorCheckCard
        formal={{ label: "형식 검증 (formal)", result: phaseData.dorFormalResult, reason: phaseData.dorFormalReason }}
        semantic={{ label: "의미 검증 (semantic)", result: phaseData.dorSemanticResult, reason: phaseData.dorSemanticReason }}
      />
    );
  }

  if (viewPhase === "plan") {
    return <TodoProgress todos={phaseData.todos} />;
  }

  // 목적: hold 상태에서는 마지막 결과를 통합 표시한다.
  if (viewPhase === "hold") {
    return (
      <div className="flex flex-col gap-4">
        {phaseData.dorFormalResult && (
          <DorCheckCard
            formal={{ label: "형식 검증 (formal)", result: phaseData.dorFormalResult, reason: phaseData.dorFormalReason }}
            semantic={{ label: "의미 검증 (semantic)", result: phaseData.dorSemanticResult, reason: phaseData.dorSemanticReason }}
          />
        )}
        {phaseData.todos.length > 0 && <TodoProgress todos={phaseData.todos} />}
      </div>
    );
  }

  return null;
}
