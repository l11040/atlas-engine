// 책임: 파이프라인 실행 스텝을 미니멀한 수평 탭으로 표시한다.

import { Loader2, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RunState, RunStep } from "@shared/ipc";

export const PIPELINE_STEPS: { key: RunStep; label: string }[] = [
  { key: "ingestion", label: "수집" },
  { key: "analyze", label: "해석" },
  { key: "risk", label: "위험" },
  { key: "plan", label: "계획" },
  { key: "execution", label: "실행" },
  { key: "archiving", label: "저장" },
  { key: "done", label: "완료" }
];

export type StepState = "done" | "active" | "failed" | "pending";

export function deriveStepState(step: RunStep, run: RunState | null): StepState {
  if (!run || run.currentStep === "idle") return "pending";

  const stepKeys = PIPELINE_STEPS.map((s) => s.key);
  const currentIdx = stepKeys.indexOf(run.currentStep);
  const stepIdx = stepKeys.indexOf(step);

  if (run.status === "failed") {
    if (stepIdx < currentIdx) return "done";
    if (stepIdx === currentIdx) return "failed";
    return "pending";
  }

  if (run.status === "completed" || run.currentStep === "done") {
    return stepIdx <= stepKeys.indexOf("done") ? "done" : "pending";
  }

  if (stepIdx < currentIdx) return "done";
  if (stepIdx === currentIdx) return "active";
  return "pending";
}

interface RunProcessBarProps {
  run: RunState | null;
  isRunning: boolean;
  starting: boolean;
  error: string | null;
  selectedStep: RunStep;
  onSelectStep: (step: RunStep) => void;
  onStart: () => void;
  onCancel: () => void;
}

export function RunProcessBar({
  run,
  isRunning,
  starting,
  error,
  selectedStep,
  onSelectStep,
  onStart,
  onCancel
}: RunProcessBarProps) {
  const stepStates = PIPELINE_STEPS.map((s) => ({
    ...s,
    state: deriveStepState(s.key, run)
  }));

  return (
    <div className="flex flex-col gap-2">
      {/* 목적: 스텝 탭 + 액션 버튼을 하나의 바에 배치한다 */}
      <div className="flex items-center gap-1 border-b border-border-subtle">
        <nav className="flex flex-1 items-center gap-0.5">
          {stepStates.map((step) => {
            const isSelected = selectedStep === step.key;
            const isClickable = step.state !== "pending";

            return (
              <button
                key={step.key}
                type="button"
                disabled={!isClickable}
                onClick={() => onSelectStep(step.key)}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-2 text-xs transition-colors duration-150",
                  isClickable && !isSelected && "hover:text-text-strong",
                  !isClickable && "cursor-default",
                  isSelected ? "text-text-strong" : "text-text-soft"
                )}
              >
                {/* 목적: 스텝 상태를 작은 인디케이터 도트로 표현한다 */}
                <span
                  className={cn(
                    "relative flex h-1.5 w-1.5 shrink-0 rounded-full",
                    step.state === "done" && "bg-emerald-500",
                    step.state === "active" && "bg-brand-500",
                    step.state === "failed" && "bg-red-500",
                    step.state === "pending" && "bg-neutral-300"
                  )}
                >
                  {step.state === "active" && (
                    <span className="absolute inset-0 animate-ping rounded-full bg-brand-400 opacity-75" />
                  )}
                </span>

                <span className={cn(
                  "whitespace-nowrap",
                  isSelected && step.state === "done" && "font-medium",
                  isSelected && step.state === "active" && "font-semibold",
                  isSelected && step.state === "failed" && "font-medium"
                )}>
                  {step.label}
                </span>

                {/* 목적: 선택된 탭의 하단 인디케이터 바 */}
                {isSelected && (
                  <span
                    className={cn(
                      "absolute bottom-0 left-1 right-1 h-[2px] rounded-full",
                      step.state === "done" && "bg-emerald-500",
                      step.state === "active" && "bg-brand-500",
                      step.state === "failed" && "bg-red-500",
                      step.state === "pending" && "bg-neutral-400"
                    )}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* 목적: 실행/중지 버튼 */}
        <div className="shrink-0 pb-1.5">
          {isRunning ? (
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={onCancel}>
              <Square className="h-3 w-3" />
              중지
            </Button>
          ) : (
            <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={starting} onClick={onStart}>
              {starting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              실행
            </Button>
          )}
        </div>
      </div>

      {/* 목적: 에러 메시지 표시 */}
      {(error || run?.error) && (
        <div className="rounded-md bg-red-50 px-3 py-1.5">
          <span className="text-xs text-red-600">{error || run?.error}</span>
        </div>
      )}
    </div>
  );
}
