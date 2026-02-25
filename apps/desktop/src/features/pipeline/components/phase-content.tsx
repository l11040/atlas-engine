// 책임: 선택된 phase에 해당하는 콘텐츠를 렌더링한다.

import { Loader2 } from "lucide-react";
import { TicketCard } from "../phases/intake/ticket-card";
import { DorCheckCard } from "../phases/dor/dor-check-card";
import { TodoProgress } from "../phases/plan/todo-progress";
import type { PhaseData } from "../hooks/use-flow-state";
import type { PipelinePhase, Ticket } from "@shared/ipc";

interface PhaseContentProps {
  viewPhase: PipelinePhase;
  phaseData: PhaseData;
  ticket: Ticket;
  isRunning: boolean;
}

// 목적: 실행 중인 phase에 로딩 표시를 보여준다.
function RunningBanner() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-brand-500/20 bg-brand-50 px-4 py-3">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-500" />
      <span className="text-xs font-medium text-brand-600">실행 중...</span>
    </div>
  );
}

export function PhaseContent({ viewPhase, phaseData, ticket, isRunning }: PhaseContentProps) {
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
    // 목적: 재실행 시 todo가 아직 없으면 실행 중 표시를 보여준다.
    if (isRunning && phaseData.todos.length === 0) {
      return <RunningBanner />;
    }
    return <TodoProgress todos={phaseData.todos} ticket={ticket} />;
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
        {phaseData.todos.length > 0 && <TodoProgress todos={phaseData.todos} ticket={ticket} />}
      </div>
    );
  }

  return null;
}
