// 책임: 작업 실행 현황을 검수자 친화적으로 표시한다.

import type { ExecutionPlan, TaskExecutionState, TaskStep, TaskUnit } from "@shared/ipc";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronRight, FileCode, MessageSquare, CheckCircle2, XCircle, Clock, Loader2, Link2, ShieldCheck, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExecutionViewProps {
  plan: ExecutionPlan | null;
  taskStates: Record<string, TaskExecutionState>;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  idle: { label: "대기", variant: "outline", icon: Clock },
  running: { label: "실행 중", variant: "default", icon: Loader2 },
  awaiting_approval: { label: "승인 대기", variant: "secondary", icon: Clock },
  approved: { label: "승인됨", variant: "secondary", icon: CheckCircle2 },
  rejected: { label: "반려됨", variant: "destructive", icon: XCircle },
  completed: { label: "완료", variant: "secondary", icon: CheckCircle2 },
  failed: { label: "실패", variant: "destructive", icon: XCircle }
};

// 목적: 태스크 내부 단계를 순서대로 정의한다.
const TASK_STEPS: { key: TaskStep; label: string }[] = [
  { key: "generate_changes", label: "생성" },
  { key: "explain_changes", label: "설명" },
  { key: "self_verify", label: "검증" },
  { key: "revise", label: "수정" },
  { key: "approval_gate", label: "승인" },
  { key: "apply_changes", label: "적용" },
  { key: "post_verify", label: "회귀" },
  { key: "done", label: "완료" }
];

type TaskStepState = "done" | "active" | "pending" | "skipped";

function deriveTaskStepState(stepKey: TaskStep, currentStep: TaskStep, taskStatus: string): TaskStepState {
  const stepKeys = TASK_STEPS.map((s) => s.key);
  const currentIdx = stepKeys.indexOf(currentStep);
  const stepIdx = stepKeys.indexOf(stepKey);

  if (taskStatus === "completed" || currentStep === "done") return "done";
  if (taskStatus === "failed") {
    if (stepIdx < currentIdx) return "done";
    if (stepIdx === currentIdx) return "active";
    return "pending";
  }

  if (stepIdx < currentIdx) return "done";
  if (stepIdx === currentIdx) return "active";
  return "pending";
}

// 목적: 태스크 내부 단계를 미니 도트 프로세스 바로 표시한다.
function TaskStepBar({ currentStep, taskStatus }: { currentStep: TaskStep; taskStatus: string }) {
  // 목적: revise 단계는 반복 루프이므로 실제로 revise에 있을 때만 표시한다.
  const visibleSteps = TASK_STEPS.filter(
    (s) => s.key !== "revise" || currentStep === "revise"
  );

  return (
    <div className="flex items-center gap-1">
      {visibleSteps.map((step, i) => {
        const stepState = deriveTaskStepState(step.key, currentStep, taskStatus);
        return (
          <div key={step.key} className="flex items-center gap-1">
            {i > 0 && <span className="h-px w-2 bg-neutral-200" />}
            <div className="flex items-center gap-1">
              <span
                className={cn(
                  "relative flex h-1.5 w-1.5 rounded-full",
                  stepState === "done" && "bg-emerald-500",
                  stepState === "active" && "bg-brand-500",
                  stepState === "pending" && "bg-neutral-300",
                  stepState === "skipped" && "bg-neutral-200"
                )}
              >
                {stepState === "active" && (
                  <span className="absolute inset-0 animate-ping rounded-full bg-brand-400 opacity-75" />
                )}
              </span>
              <span
                className={cn(
                  "text-[9px] whitespace-nowrap",
                  stepState === "done" && "text-emerald-600",
                  stepState === "active" && "font-semibold text-brand-600",
                  stepState === "pending" && "text-neutral-400",
                  stepState === "skipped" && "text-neutral-300"
                )}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VerificationBadge({ verdict }: { verdict: "pass" | "fail" }) {
  return verdict === "pass"
    ? <Badge variant="secondary" className="text-[10px] gap-1"><ShieldCheck className="h-3 w-3" />통과</Badge>
    : <Badge variant="destructive" className="text-[10px] gap-1"><ShieldAlert className="h-3 w-3" />실패</Badge>;
}

function ExecutionCard({ task, state }: { task: TaskUnit; state: TaskExecutionState | null }) {
  const statusConfig = STATUS_CONFIG[state?.status ?? "idle"] ?? STATUS_CONFIG.idle!;
  const StatusIcon = statusConfig.icon;
  const isRunning = state?.status === "running";

  return (
    <section className="rounded-md border border-border-subtle">
      {/* 헤더 */}
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2.5">
        <StatusIcon className={cn("h-3.5 w-3.5 shrink-0", isRunning && "animate-spin")} />
        <Badge variant={statusConfig.variant} className="shrink-0 text-[10px]">{statusConfig.label}</Badge>
        <span className="flex-1 truncate text-xs font-medium text-text-strong">{task.title}</span>
        {state && (
          <span className="shrink-0 text-[10px] text-text-soft">
            시도 {state.attempt.current}/{state.attempt.max}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 p-3">
        {/* 태스크 내부 단계 프로세스 바 */}
        {state && state.currentStep !== "idle" && (
          <div className="flex items-center justify-between gap-2">
            <TaskStepBar currentStep={state.currentStep} taskStatus={state.status} />
            {task.linked_ac_ids.length > 0 && (
              <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-text-soft">
                <Link2 className="h-3 w-3" />
                {task.linked_ac_ids.join(", ")}
              </span>
            )}
          </div>
        )}

        {/* 변경사항 */}
        {state?.changeSets && (
          <Collapsible>
            <CollapsibleTrigger className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-surface-subtle transition-colors [&[data-state=open]>svg.chevron]:rotate-90">
              <ChevronRight className="chevron h-3 w-3 shrink-0 text-text-soft transition-transform" />
              <FileCode className="h-3.5 w-3.5 text-tool-edit" />
              <span className="text-text-strong">변경사항</span>
              <Badge variant="secondary" className="ml-auto text-[10px]">{state.changeSets.changes.length}개 파일</Badge>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1 flex flex-col gap-1 pl-7">
                {state.changeSets.changes.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <Badge variant={c.action === "create" ? "secondary" : c.action === "delete" ? "destructive" : "outline"} className="text-[9px]">
                      {c.action}
                    </Badge>
                    <span className="font-mono text-text-muted">{c.path}</span>
                    <span className="truncate text-text-soft">{c.diff_summary}</span>
                  </div>
                ))}
                {state.changeSets.scope_violations.length > 0 && (
                  <div className="mt-1 rounded bg-red-50 px-2 py-1 text-[10px] text-status-danger">
                    스코프 위반: {state.changeSets.scope_violations.join(", ")}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* 설명 */}
        {state?.explanation && (
          <Collapsible>
            <CollapsibleTrigger className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-surface-subtle transition-colors [&[data-state=open]>svg.chevron]:rotate-90">
              <ChevronRight className="chevron h-3 w-3 shrink-0 text-text-soft transition-transform" />
              <MessageSquare className="h-3.5 w-3.5 text-brand-500" />
              <span className="text-text-strong">변경 설명</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1 flex flex-col gap-2 pl-7">
                <p className="text-xs text-text-strong">{state.explanation.summary}</p>
                <p className="text-[10px] text-text-muted">{state.explanation.implementation_rationale}</p>
                {state.explanation.change_reasons.map((cr, i) => (
                  <div key={i} className="flex items-start gap-2 text-[10px]">
                    <span className="shrink-0 font-mono text-text-soft">{cr.path}</span>
                    <span className="text-text-muted">{cr.reason}</span>
                    {cr.linked_ac_ids.length > 0 && (
                      <span className="shrink-0 text-text-soft">[{cr.linked_ac_ids.join(",")}]</span>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* 검증 결과 */}
        {state?.verification && (
          <div className="flex items-center gap-2 rounded px-2 py-1.5 text-xs">
            <VerificationBadge verdict={state.verification.verdict} />
            <span className="text-text-muted">사전 검증</span>
            {state.verification.failure_reasons.length > 0 && (
              <span className="truncate text-[10px] text-status-danger">
                {state.verification.failure_reasons[0]}
              </span>
            )}
          </div>
        )}

        {state?.postVerification && (
          <div className="flex items-center gap-2 rounded px-2 py-1.5 text-xs">
            <VerificationBadge verdict={state.postVerification.verdict} />
            <span className="text-text-muted">회귀 검증</span>
            {state.postVerification.failure_reasons.length > 0 && (
              <span className="truncate text-[10px] text-status-danger">
                {state.postVerification.failure_reasons[0]}
              </span>
            )}
          </div>
        )}

        {/* 승인 기록 */}
        {state?.approval && (
          <div className={cn(
            "flex items-center gap-2 rounded px-2 py-1.5 text-[10px]",
            state.approval.decision === "approved" ? "bg-emerald-50" : "bg-red-50"
          )}>
            {state.approval.decision === "approved"
              ? <CheckCircle2 className="h-3 w-3 text-status-success" />
              : <XCircle className="h-3 w-3 text-status-danger" />
            }
            <span className="font-medium">
              {state.approval.decision === "approved" ? "승인됨" : state.approval.decision === "rejected" ? "반려됨" : "재생성"}
            </span>
            <span className="text-text-soft">({state.approval.decidedBy})</span>
            {state.approval.reason && <span className="text-text-muted">{state.approval.reason}</span>}
          </div>
        )}

        {/* 에러 */}
        {state?.error && (
          <div className="rounded bg-red-50 px-2 py-1.5 text-xs text-status-danger">
            {state.error}
          </div>
        )}
      </div>
    </section>
  );
}

export function ExecutionView({ plan, taskStates }: ExecutionViewProps) {
  if (!plan) {
    return <p className="text-xs text-text-soft p-4">실행 계획이 없습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-3 overflow-auto p-4">
      {plan.tasks.map((task) => (
        <ExecutionCard key={task.id} task={task} state={taskStates[task.id] ?? null} />
      ))}
    </div>
  );
}
