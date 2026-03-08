// 책임: 작업 실행 현황을 표시한다.

import type { ExecutionPlan, TaskExecutionState } from "@shared/ipc";
import { TaskCard } from "../components/task-card";

interface ExecutionViewProps {
  plan: ExecutionPlan | null;
  taskStates: Record<string, TaskExecutionState>;
}

export function ExecutionView({ plan, taskStates }: ExecutionViewProps) {
  if (!plan) {
    return <p className="text-xs text-text-soft p-4">실행 계획이 없습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <h3 className="text-sm font-medium text-text-strong">작업 실행</h3>
      <div className="flex flex-col gap-2">
        {plan.tasks.map((task) => (
          <TaskCard key={task.id} task={task} state={taskStates[task.id] ?? null} />
        ))}
      </div>
    </div>
  );
}
