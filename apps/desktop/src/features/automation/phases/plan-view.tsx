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
      <TaskList tasks={plan.tasks} taskStates={taskStates} onSelect={onSelectTask} />
    </div>
  );
}
