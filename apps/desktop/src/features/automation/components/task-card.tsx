// 책임: 개별 작업의 상세 상태를 카드로 표시한다.

import type { TaskExecutionState, TaskUnit } from "@shared/ipc";
import { Badge } from "@/components/ui/badge";

interface TaskCardProps {
  task: TaskUnit;
  state: TaskExecutionState | null;
}

export function TaskCard({ task, state }: TaskCardProps) {
  return (
    <div className="rounded-lg border border-border-default p-4">
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="outline" className="text-[10px]">
          {state?.status ?? "idle"}
        </Badge>
        <span className="text-xs font-medium text-text-strong">{task.title}</span>
      </div>
      <p className="text-xs text-text-soft mb-2">{task.description}</p>
      {state && (
        <div className="flex items-center gap-3 text-[10px] text-text-soft">
          <span>단계: {state.currentStep}</span>
          <span>시도: {state.attempt.current}/{state.attempt.max}</span>
        </div>
      )}
    </div>
  );
}
