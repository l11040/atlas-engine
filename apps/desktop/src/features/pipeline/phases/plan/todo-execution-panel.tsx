// 책임: Todo 목록(좌측)과 선택된 Todo의 실행 플로우(우측) 2패널 레이아웃을 관리한다.
// 전체 실행 버튼으로 wave 기반 병렬/직렬 실행을 트리거한다.

import { useMemo, useState } from "react";
import { Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TodoListPanel } from "./todo-list-panel";
import { TodoFlowPanel } from "./todo-flow-panel";
import { buildExecutionPlan } from "./execution-plan";
import { useTodoFlowState } from "../../hooks/use-todo-flow-state";
import type { Ticket, TodoItem } from "@shared/ipc";

interface TodoExecutionPanelProps {
  todos: TodoItem[];
  ticket: Ticket;
}

export function TodoExecutionPanel({ todos, ticket }: TodoExecutionPanelProps) {
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(todos.length > 0 ? todos[0]!.id : null);
  const { getFlowState, startFlow, resetFlow, executeAll, isExecutingAll } = useTodoFlowState(todos);

  // 목적: wave 실행 계획은 UI 표시용으로 컴포넌트에서 계산한다 (실제 실행은 백엔드에서 처리).
  const plan = useMemo(() => buildExecutionPlan(todos), [todos]);

  const selectedTodo = todos.find((t) => t.id === selectedTodoId) ?? null;
  const selectedFlowState = selectedTodoId ? getFlowState(selectedTodoId) : null;

  return (
    <div className="flex flex-col gap-3">
      {/* 실행 계획 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-text-strong">실행 계획</span>
          <span className="text-2xs text-text-soft">
            {plan.waves.length}개 wave · {todos.length}개 todo
          </span>
        </div>
        <Button size="sm" className="h-7 gap-1 text-xs" disabled={isExecutingAll} onClick={executeAll}>
          {isExecutingAll ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              실행 중...
            </>
          ) : (
            <>
              <Play className="h-3 w-3" />
              전체 실행
            </>
          )}
        </Button>
      </div>

      {/* 2패널 레이아웃 */}
      <div className="flex gap-4" style={{ minHeight: "480px" }}>
        {/* 좌측: Todo 목록 (wave 그룹) */}
        <div className="w-80 shrink-0">
          <TodoListPanel
            todos={todos}
            selectedTodoId={selectedTodoId}
            onSelectTodo={setSelectedTodoId}
            getFlowState={getFlowState}
            plan={plan}
          />
        </div>

        {/* 우측: 선택된 Todo의 플로우 */}
        <div className="min-w-0 flex-1">
          {selectedTodo && selectedFlowState ? (
            <TodoFlowPanel
              todo={selectedTodo}
              flowState={selectedFlowState}
              onStartFlow={() => startFlow(selectedTodo.id)}
              onResetFlow={() => resetFlow(selectedTodo.id)}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-border-subtle bg-surface-base text-xs text-text-soft">
              좌측에서 Todo를 선택하세요
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
