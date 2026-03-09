// 책임: 실행 계획(작업 목록, 의존 관계, 스코프)을 표시한다.

import type { ExecutionPlan, TaskExecutionState } from "@shared/ipc";
import { TaskList } from "../components/task-list";

interface PlanViewProps {
  plan: ExecutionPlan | null;
  taskStates: Record<string, TaskExecutionState>;
  onSelectTask?: (taskId: string) => void;
}

export function PlanView({ plan, taskStates, onSelectTask }: PlanViewProps) {
  if (!plan) {
    return <p className="text-xs text-text-soft p-4">실행 계획 대기 중...</p>;
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <h3 className="text-sm font-medium text-text-strong">
        실행 계획 ({plan.tasks.length}개 작업)
      </h3>
      <div className="rounded-md border border-border-subtle bg-surface-subtle p-3 text-xs">
        <p className="text-text-strong">
          <span className="text-text-soft">검증 전략:</span> {plan.validation_strategy}
        </p>
        <p className="mt-1 text-text-strong">
          <span className="text-text-soft">롤백 전략:</span> {plan.rollback_strategy}
        </p>
      </div>
      <TaskList tasks={plan.tasks} taskStates={taskStates} onSelect={onSelectTask} />
    </div>
  );
}
