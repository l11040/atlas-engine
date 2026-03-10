// 책임: 실행 계획(작업 목록, 의존 관계, 스코프)을 검수자 친화적으로 표시한다.

import type { ExecutionPlan, TaskExecutionState, TaskUnit } from "@shared/ipc";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronRight, ListTodo, ShieldCheck, Undo2, Link2, FolderOpen, FolderLock, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlanViewProps {
  plan: ExecutionPlan | null;
  taskStates: Record<string, TaskExecutionState>;
  onSelectTask?: (taskId: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  idle: { label: "대기", variant: "outline" },
  running: { label: "실행 중", variant: "default" },
  awaiting_approval: { label: "승인 대기", variant: "secondary" },
  completed: { label: "완료", variant: "secondary" },
  failed: { label: "실패", variant: "destructive" }
};

function TaskRow({ task, state, onSelect }: { task: TaskUnit; state?: TaskExecutionState; onSelect?: () => void }) {
  const statusConfig = STATUS_CONFIG[state?.status ?? "idle"] ?? STATUS_CONFIG.idle!;

  return (
    <Collapsible className="border-b border-border-subtle last:border-b-0">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-subtle transition-colors [&[data-state=open]>svg.chevron]:rotate-90">
        <ChevronRight className="chevron h-3 w-3 shrink-0 text-text-soft transition-transform" />
        <Badge variant={statusConfig.variant} className="shrink-0 text-[10px]">{statusConfig.label}</Badge>
        <span className="flex-1 truncate text-xs font-medium text-text-strong">{task.title}</span>
        {task.linked_ac_ids.length > 0 && (
          <span className="shrink-0 flex items-center gap-0.5 text-[10px] text-text-soft">
            <Link2 className="h-3 w-3" />
            {task.linked_ac_ids.join(", ")}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-2 px-3 pb-3 pl-8">
          <p className="text-xs text-text-muted">{task.description}</p>

          {/* 스코프 */}
          <div className="flex flex-wrap gap-3 text-[10px]">
            {task.scope.editable_paths.length > 0 && (
              <span className="flex items-center gap-1 text-status-success">
                <FolderOpen className="h-3 w-3" />
                편집: {task.scope.editable_paths.join(", ")}
              </span>
            )}
            {task.scope.forbidden_paths.length > 0 && (
              <span className="flex items-center gap-1 text-status-danger">
                <FolderLock className="h-3 w-3" />
                금지: {task.scope.forbidden_paths.join(", ")}
              </span>
            )}
          </div>

          {/* 검증 명령어 */}
          {task.verify_cmd && (
            <div className="flex items-center gap-1.5 rounded bg-surface-subtle px-2 py-1 text-[10px] font-mono text-text-muted">
              <Terminal className="h-3 w-3 shrink-0 text-tool-bash" />
              {task.verify_cmd}
            </div>
          )}

          {/* 의존성 */}
          {task.deps.length > 0 && (
            <span className="text-[10px] text-text-soft">선행 작업: {task.deps.join(", ")}</span>
          )}

          {onSelect && (
            <button
              type="button"
              className="self-start rounded px-2 py-0.5 text-[10px] text-brand-500 hover:bg-surface-subtle transition-colors"
              onClick={onSelect}
            >
              상세 보기
            </button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function PlanView({ plan, taskStates, onSelectTask }: PlanViewProps) {
  if (!plan) {
    return <p className="text-xs text-text-soft p-4">실행 계획 대기 중...</p>;
  }

  return (
    <div className="flex flex-col gap-3 overflow-auto p-4">
      {/* 전략 요약 */}
      <div className="flex gap-2">
        <div className="flex flex-1 items-start gap-2 rounded-md border border-border-subtle px-3 py-2.5">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-success" />
          <div>
            <h4 className="text-[10px] font-medium text-text-soft">검증 전략</h4>
            <p className="text-xs text-text-strong">{plan.validation_strategy}</p>
          </div>
        </div>
        <div className="flex flex-1 items-start gap-2 rounded-md border border-border-subtle px-3 py-2.5">
          <Undo2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" />
          <div>
            <h4 className="text-[10px] font-medium text-text-soft">롤백 전략</h4>
            <p className="text-xs text-text-strong">{plan.rollback_strategy}</p>
          </div>
        </div>
      </div>

      {/* 작업 목록 */}
      <section className="rounded-md border border-border-subtle">
        <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
          <ListTodo className="h-3.5 w-3.5 text-brand-500" />
          <h4 className="text-xs font-medium text-text-strong">작업 목록</h4>
          <Badge variant="secondary" className="ml-auto text-[10px]">{plan.tasks.length}</Badge>
        </div>
        <div className="flex flex-col">
          {plan.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              state={taskStates[task.id]}
              onSelect={onSelectTask ? () => onSelectTask(task.id) : undefined}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
