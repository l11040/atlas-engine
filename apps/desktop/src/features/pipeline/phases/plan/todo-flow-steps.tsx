// 책임: Todo 실행 플로우의 단계(workorder→explore→execute→verify→dod)를 breadcrumb으로 표시한다.

import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TodoFlowPhase, TodoFlowStepState } from "@shared/ipc";

const FLOW_PHASES: { key: TodoFlowPhase; label: string }[] = [
  { key: "workorder", label: "WorkOrder" },
  { key: "explore", label: "Explore" },
  { key: "execute", label: "Execute" },
  { key: "verify", label: "Verify" },
  { key: "dod", label: "DoD" }
];

interface TodoFlowStepsProps {
  steps: TodoFlowStepState[];
  currentPhase: TodoFlowPhase | null;
  viewPhase: TodoFlowPhase;
  onPhaseClick: (phase: TodoFlowPhase) => void;
}

export function TodoFlowSteps({ steps, viewPhase, onPhaseClick }: TodoFlowStepsProps) {
  const stepMap = new Map(steps.map((s) => [s.phase, s]));

  return (
    <div className="flex items-center gap-0.5">
      {FLOW_PHASES.map((phase, idx) => {
        const step = stepMap.get(phase.key);
        const status = step?.status ?? "idle";
        const isSelected = viewPhase === phase.key;
        const isLast = idx === FLOW_PHASES.length - 1;
        const isClickable = status !== "idle" || isSelected;

        return (
          <div key={phase.key} className="flex items-center">
            <button
              type="button"
              disabled={!isClickable}
              onClick={() => onPhaseClick(phase.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-2xs font-medium transition-all duration-150",
                status === "completed" && "text-status-success",
                status === "running" && "text-brand-600",
                status === "idle" && "text-text-soft",
                status === "error" && "text-status-danger",
                isSelected && status === "completed" && "bg-phase-done-bg",
                isSelected && status === "running" && "bg-phase-active-bg",
                isSelected && status === "idle" && "bg-surface-subtle",
                isSelected && status === "error" && "bg-status-danger/10",
                isClickable && "cursor-pointer"
              )}
            >
              {status === "completed" && <Check className="h-3 w-3" />}
              {status === "running" && <Loader2 className="h-3 w-3 animate-spin" />}
              {status === "idle" && <div className="h-1.5 w-1.5 rounded-full bg-neutral-300" />}
              {status === "error" && <div className="h-1.5 w-1.5 rounded-full bg-status-danger" />}
              <span>{phase.label}</span>
            </button>
            {!isLast && (
              <div className={cn("h-px w-3", status === "completed" ? "bg-status-success/40" : "bg-neutral-200")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
