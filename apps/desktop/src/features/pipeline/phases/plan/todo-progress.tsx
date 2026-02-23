// 책임: Todo 목록의 진행 상황과 상세 정보(reason, route, risk)를 표시한다.

import { Check, Circle, Loader2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TodoItem, TodoStatus } from "@shared/ipc";

interface TodoProgressProps {
  todos: TodoItem[];
}

// 목적: 상태별 아이콘과 색상을 매핑한다.
const STATUS_META: Record<TodoStatus, { icon: typeof Check; colorClass: string }> = {
  done: { icon: Check, colorClass: "text-status-success" },
  in_progress: { icon: Loader2, colorClass: "text-brand-500" },
  pending: { icon: Circle, colorClass: "text-text-soft" },
  blocked: { icon: AlertCircle, colorClass: "text-status-danger" }
};

// 목적: risk 레벨별 색상을 매핑한다.
const RISK_COLOR: Record<string, string> = {
  low: "bg-status-success/10 text-status-success",
  med: "bg-status-warning/10 text-status-warning",
  high: "bg-status-danger/10 text-status-danger"
};

export function TodoProgress({ todos }: TodoProgressProps) {
  const doneCount = todos.filter((t) => t.status === "done").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-text-strong">할 일 진행</span>
        <span className="text-2xs text-text-soft">
          {doneCount} / {todos.length}
        </span>
      </div>

      {/* 진행 바 */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
        <div
          className="h-full rounded-full bg-brand-500 transition-all"
          style={{ width: todos.length > 0 ? `${(doneCount / todos.length) * 100}%` : "0%" }}
        />
      </div>

      {/* Todo 목록 */}
      <div className="flex flex-col gap-1">
        {todos.map((todo) => {
          const meta = STATUS_META[todo.status];
          const Icon = meta.icon;
          const isRunning = todo.status === "in_progress";

          return (
            <div
              key={todo.id}
              className={cn(
                "flex flex-col gap-1 rounded-xs px-2 py-1.5",
                isRunning && "bg-brand-50"
              )}
            >
              <div className="flex items-center gap-2">
                <Icon
                  className={cn("h-3.5 w-3.5 shrink-0", meta.colorClass, isRunning && "animate-spin")}
                />
                <span
                  className={cn(
                    "flex-1 truncate text-2xs",
                    todo.status === "done" ? "text-text-soft line-through" : "text-text-muted"
                  )}
                >
                  {todo.title}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  {/* route 뱃지 */}
                  <Badge variant="outline" className="text-2xs">
                    {todo.route}
                  </Badge>
                  {/* risk 뱃지 */}
                  <Badge className={cn("text-2xs", RISK_COLOR[todo.risk])}>
                    {todo.risk}
                  </Badge>
                  {isRunning && todo.attempt.n > 0 && (
                    <Badge variant="outline" className="text-2xs">
                      시도 {todo.attempt.n}
                    </Badge>
                  )}
                </div>
              </div>
              {/* reason: AC→TS 추적성 */}
              {todo.reason && (
                <span className="pl-5.5 text-2xs text-text-soft">{todo.reason}</span>
              )}
              {/* deps: 의존성 */}
              {todo.deps.length > 0 && (
                <div className="flex gap-1 pl-5.5">
                  <span className="text-2xs text-text-soft">deps:</span>
                  {todo.deps.map((dep) => (
                    <Badge key={dep} variant="outline" className="font-mono text-2xs">
                      {dep}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {todos.length === 0 && (
        <div className="flex items-center justify-center py-4 text-2xs text-text-soft">Todo 항목 없음</div>
      )}
    </div>
  );
}
