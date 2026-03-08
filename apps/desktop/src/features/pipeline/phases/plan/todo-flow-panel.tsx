// 책임: 선택된 Todo의 실행 플로우 (workorder→explore→execute→verify→dod) 상태를 표시한다.

import { useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TodoFlowSteps } from "./todo-flow-steps";
import { TodoFlowCard } from "./todo-flow-card";
import type { TodoItem, TodoFlowState, TodoFlowPhase } from "@shared/ipc";

// 목적: risk 레벨별 색상을 매핑한다.
const RISK_COLOR: Record<string, string> = {
  low: "border-status-success/40 bg-status-success/15 text-status-success font-semibold",
  med: "border-status-warning/40 bg-status-warning/20 text-status-warning font-semibold",
  high: "border-status-danger/50 bg-status-danger/20 text-status-danger font-semibold"
};

interface TodoFlowPanelProps {
  todo: TodoItem;
  flowState: TodoFlowState;
  onStartFlow: () => void;
  onResetFlow: () => void;
}

export function TodoFlowPanel({ todo, flowState, onStartFlow, onResetFlow }: TodoFlowPanelProps) {
  // 목적: 사용자가 조회 중인 플로우 단계. 기본값은 현재 phase 또는 첫 단계.
  const [viewPhase, setViewPhase] = useState<TodoFlowPhase>(flowState.currentPhase ?? "workorder");

  const currentStep = flowState.steps.find((s) => s.phase === viewPhase) ?? null;
  const isFlowIdle = flowState.status === "idle";

  return (
    <div className="flex h-full flex-col rounded-lg border border-border-subtle bg-surface-base">
      {/* 헤더: Todo 제목 + 메타 정보 + 실행 버튼 */}
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-strong">{todo.title}</span>
          <Badge variant="outline" className="text-2xs">{todo.route}</Badge>
          <Badge variant="outline" className={cn("text-2xs", RISK_COLOR[todo.risk])}>{todo.risk}</Badge>
          {todo.attempt.n > 0 && (
            <Badge variant="outline" className="text-2xs">시도 {todo.attempt.n}/{todo.attempt.max}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isFlowIdle && todo.status === "pending" && (
            <Button size="sm" className="h-7 gap-1 text-xs" onClick={onStartFlow}>
              <Play className="h-3 w-3" />
              실행
            </Button>
          )}
          {flowState.status === "completed" && (
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={onResetFlow}>
              <RotateCcw className="h-3 w-3" />
              리셋
            </Button>
          )}
          {flowState.status === "error" && (
            <Button size="sm" className="h-7 gap-1 text-xs" onClick={onStartFlow}>
              <RotateCcw className="h-3 w-3" />
              재시도
            </Button>
          )}
        </div>
      </div>

      {/* 플로우 단계 breadcrumb */}
      <div className="border-b border-border-subtle px-5 py-2">
        <TodoFlowSteps
          steps={flowState.steps}
          currentPhase={flowState.currentPhase}
          viewPhase={viewPhase}
          onPhaseClick={setViewPhase}
        />
      </div>

      {/* 선택된 단계의 카드 콘텐츠 */}
      <div className="flex-1 overflow-y-auto p-5">
        {currentStep ? (
          <TodoFlowCard step={currentStep} />
        ) : (
          <div className="flex items-center justify-center py-8 text-xs text-text-soft">단계를 선택하세요</div>
        )}
      </div>
    </div>
  );
}
