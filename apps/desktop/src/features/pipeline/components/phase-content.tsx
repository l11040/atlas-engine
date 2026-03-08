// 책임: 선택된 phase에 해당하는 콘텐츠를 렌더링한다.

import { Check, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TicketCard } from "../phases/intake/ticket-card";
import { DorCheckCard } from "../phases/dor/dor-check-card";
import { TodoExecutionPanel } from "../phases/plan/todo-execution-panel";
import type { PhaseData } from "../hooks/use-flow-state";
import type { PipelinePhase, Ticket, TodoItem } from "@shared/ipc";

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
    return <TodoExecutionPanel todos={phaseData.todos} ticket={ticket} />;
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
        {phaseData.todos.length > 0 && <TodoExecutionPanel todos={phaseData.todos} ticket={ticket} />}
      </div>
    );
  }

  // 목적: 모든 Todo 실행 완료 후 최종 요약을 표시한다.
  if (viewPhase === "done") {
    return <DonePhaseSummary todos={phaseData.todos} />;
  }

  return null;
}

// ─── Done Phase 요약 ──────────────────────────────────────────

function DonePhaseSummary({ todos }: { todos: TodoItem[] }) {
  const doneCount = todos.filter((t) => t.status === "done").length;
  const failedCount = todos.filter((t) => t.status === "blocked").length;
  const totalCount = todos.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-md border border-status-success/30 bg-status-success/5 p-5">
        <div className="flex items-center gap-2">
          <Check className="h-5 w-5 text-status-success" />
          <h2 className="text-sm font-semibold text-text-strong">파이프라인 완료</h2>
        </div>
        <div className="flex items-center gap-4 text-xs text-text-muted">
          <span className="flex items-center gap-1">
            <Check className="h-3 w-3 text-status-success" />
            완료 {doneCount}/{totalCount}
          </span>
          {failedCount > 0 && (
            <span className="flex items-center gap-1">
              <X className="h-3 w-3 text-status-danger" />
              실패 {failedCount}
            </span>
          )}
        </div>
      </div>

      {/* 목적: 각 Todo의 최종 결과를 뱃지로 요약 표시한다. */}
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold text-text-strong">Todo 결과 요약</h3>
        <div className="flex flex-col gap-1.5">
          {todos.map((todo) => (
            <div key={todo.id} className={cn(
              "flex items-center justify-between rounded-md border px-3 py-2",
              todo.status === "done" ? "border-status-success/20 bg-status-success/5" : "border-border-subtle bg-surface-base"
            )}>
              <div className="flex items-center gap-2">
                {todo.status === "done" ? (
                  <Check className="h-3.5 w-3.5 text-status-success" />
                ) : (
                  <X className="h-3.5 w-3.5 text-status-danger" />
                )}
                <span className={cn("text-xs", todo.status === "done" ? "text-text-strong" : "text-text-muted")}>{todo.title}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-2xs">{todo.route}</Badge>
                <Badge variant="outline" className={cn(
                  "text-2xs",
                  todo.status === "done" && "text-status-success",
                  todo.status === "blocked" && "text-status-danger",
                  todo.status === "pending" && "text-text-soft"
                )}>
                  {todo.status === "done" ? "완료" : todo.status === "blocked" ? "실패" : todo.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
