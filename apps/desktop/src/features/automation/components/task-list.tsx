// 책임: 전체 작업 목록과 상태 배지를 표시한다.

import type { TaskUnit, TaskExecutionState } from "@shared/ipc";
import { Badge } from "@/components/ui/badge";

interface TaskListProps {
  tasks: TaskUnit[];
  taskStates: Record<string, TaskExecutionState>;
  onSelect?: (taskId: string) => void;
}

export function TaskList({ tasks, taskStates, onSelect }: TaskListProps) {
  if (tasks.length === 0) {
    return <p className="text-xs text-text-soft py-4">작업 목록이 비어 있습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {tasks.map((task) => {
        const state = taskStates[task.id];
        return (
          <button
            key={task.id}
            type="button"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-surface-subtle transition-colors"
            onClick={() => onSelect?.(task.id)}
          >
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {state?.status ?? "idle"}
            </Badge>
            <span className="truncate text-text-strong">{task.title}</span>
          </button>
        );
      })}
    </div>
  );
}
