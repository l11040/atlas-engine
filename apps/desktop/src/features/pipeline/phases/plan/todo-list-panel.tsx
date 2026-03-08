// 책임: Todo 목록을 wave 그룹별로 좌측 패널에 표시하고, 클릭 시 해당 Todo를 선택한다.

import { Check, Circle, Loader2, AlertCircle, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TodoItem, TodoStatus, TodoFlowState } from "@shared/ipc";
import type { ExecutionPlan } from "./execution-plan";

// 목적: 상태별 아이콘과 색상을 매핑한다.
const STATUS_META: Record<TodoStatus, { icon: typeof Check; colorClass: string }> = {
  done: { icon: Check, colorClass: "text-status-success" },
  in_progress: { icon: Loader2, colorClass: "text-brand-500" },
  pending: { icon: Circle, colorClass: "text-text-soft" },
  blocked: { icon: AlertCircle, colorClass: "text-status-danger" }
};

interface TodoListPanelProps {
  todos: TodoItem[];
  selectedTodoId: string | null;
  onSelectTodo: (todoId: string) => void;
  getFlowState: (todoId: string) => TodoFlowState;
  plan: ExecutionPlan;
}

export function TodoListPanel({ todos, selectedTodoId, onSelectTodo, getFlowState, plan }: TodoListPanelProps) {
  const doneCount = todos.filter((t) => t.status === "done").length;
  const todoMap = new Map(todos.map((t) => [t.id, t]));

  return (
    <div className="flex h-full flex-col rounded-lg border border-border-subtle bg-surface-base">
      {/* 헤더 + 진행 바 */}
      <div className="flex flex-col gap-2 border-b border-border-subtle px-3 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-text-strong">할 일 목록</h3>
          <span className="text-2xs text-text-soft">{doneCount} / {todos.length}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: todos.length > 0 ? `${(doneCount / todos.length) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {/* wave 그룹별 Todo 리스트 */}
      <div className="flex-1 overflow-y-auto">
        {plan.waves.map((wave) => {
          const waveTodos = wave.todoIds.map((id) => todoMap.get(id)).filter(Boolean) as TodoItem[];
          if (waveTodos.length === 0) return null;

          return (
            <div key={wave.index}>
              {/* wave 헤더 */}
              <div className="flex items-center gap-1.5 border-b border-border-subtle bg-surface-subtle/50 px-3 py-1.5">
                <Layers className="h-3 w-3 text-text-soft" />
                <span className="text-2xs font-semibold text-text-muted">
                  Wave {wave.index + 1}
                </span>
                {waveTodos.length > 1 && (
                  <Badge variant="outline" className="text-2xs px-1 py-0 text-text-soft">
                    병렬 {waveTodos.length}
                  </Badge>
                )}
              </div>

              {/* wave 내 Todo 항목들 */}
              {waveTodos.map((todo) => {
                const meta = STATUS_META[todo.status];
                const Icon = meta.icon;
                const isSelected = todo.id === selectedTodoId;
                const isRunning = todo.status === "in_progress";
                const flowState = getFlowState(todo.id);
                const flowRunning = flowState.status === "running";

                return (
                  <button
                    key={todo.id}
                    type="button"
                    onClick={() => onSelectTodo(todo.id)}
                    className={cn(
                      "flex w-full items-start gap-2 border-b border-border-subtle px-3 py-2.5 text-left transition-colors",
                      isSelected ? "border-l-2 border-l-brand-500 bg-brand-50" : "hover:bg-surface-subtle"
                    )}
                  >
                    <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", meta.colorClass, isRunning && "animate-spin")} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className={cn("text-xs leading-tight", todo.status === "done" ? "text-text-soft line-through" : "text-text-strong")}>
                        {todo.title}
                      </span>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-2xs px-1.5 py-0">{todo.route}</Badge>
                        {/* 목적: 플로우 진행 중이면 현재 단계를 표시한다. */}
                        {flowState.currentPhase && flowRunning && (
                          <Badge variant="outline" className="text-2xs px-1.5 py-0 text-brand-500">{flowState.currentPhase}</Badge>
                        )}
                        {flowState.status === "completed" && (
                          <Badge variant="outline" className="text-2xs px-1.5 py-0 text-status-success">완료</Badge>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
