// 책임: 전체 파이프라인의 각 Phase를 클릭 가능한 breadcrumb으로 표시한다.

import { Check, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelinePhase } from "@shared/ipc";

const PHASES: { key: PipelinePhase; label: string }[] = [
  { key: "intake", label: "intake" },
  { key: "dor", label: "DoR" },
  { key: "plan", label: "plan" },
  { key: "workorder", label: "workorder" },
  { key: "explore", label: "explore" },
  { key: "execute", label: "execute" },
  { key: "verify", label: "verify" },
  { key: "dod", label: "DoD" },
  { key: "done", label: "done" }
];

type PhaseState = "done" | "active" | "pending" | "hold";

// 목적: 현재 phase 기준으로 각 phase의 상태를 결정한다.
function getPhaseState(phase: PipelinePhase, currentPhase: PipelinePhase): PhaseState {
  if (currentPhase === "hold") return "pending";
  if (currentPhase === "idle") return "pending";

  const currentIdx = PHASES.findIndex((p) => p.key === currentPhase);
  const phaseIdx = PHASES.findIndex((p) => p.key === phase);
  if (phaseIdx < currentIdx) return "done";
  if (phaseIdx === currentIdx) return "active";
  return "pending";
}

interface PhasePipelineProps {
  currentPhase: PipelinePhase;
  /** 사용자가 선택한 phase (클릭으로 전환) */
  selectedPhase?: PipelinePhase;
  /** hold 상태일 때 어느 단계에서 멈췄는지 표시 */
  holdAtPhase?: PipelinePhase;
  /** 파이프라인이 현재 실행 중인지 여부 — active phase의 스피너 표시에 사용 */
  isRunning?: boolean;
  /** phase 클릭 콜백 — done/active/hold 상태인 phase만 클릭 가능 */
  onPhaseClick?: (phase: PipelinePhase) => void;
}

export function PhasePipeline({ currentPhase, selectedPhase, holdAtPhase, isRunning, onPhaseClick }: PhasePipelineProps) {
  return (
    <div className="flex items-center gap-0.5">
      {PHASES.map((phase, idx) => {
        let state = getPhaseState(phase.key, currentPhase);

        // 목적: hold 상태일 때 holdAtPhase 이전은 done, 해당 단계는 hold, 이후는 pending
        if (currentPhase === "hold" && holdAtPhase) {
          const holdIdx = PHASES.findIndex((p) => p.key === holdAtPhase);
          const phaseIdx = PHASES.findIndex((p) => p.key === phase.key);
          if (phaseIdx < holdIdx) state = "done";
          else if (phaseIdx === holdIdx) state = "hold";
          else state = "pending";
        }

        const isLast = idx === PHASES.length - 1;
        const isClickable = state !== "pending" && onPhaseClick;
        const isSelected = selectedPhase === phase.key;

        return (
          <div key={phase.key} className="flex items-center">
            <button
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onPhaseClick(phase.key)}
              className={cn(
                "relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-2xs font-medium transition-all duration-150",
                // 기본 상태 색상
                state === "done" && "text-status-success",
                state === "active" && "text-brand-600",
                state === "pending" && "text-text-soft",
                state === "hold" && "text-status-warning",
                // 선택/호버 배경: 폰트 색상의 10% (color-mix 토큰)
                isSelected && state === "done" && "bg-phase-done-bg",
                isSelected && state === "active" && "bg-phase-active-bg",
                isSelected && state === "hold" && "bg-phase-hold-bg",
                isClickable && !isSelected && state === "done" && "hover:bg-phase-done-bg",
                isClickable && !isSelected && state === "active" && "hover:bg-phase-active-bg",
                isClickable && !isSelected && state === "hold" && "hover:bg-phase-hold-bg",
                isClickable && "cursor-pointer"
              )}
            >
              {state === "done" && <Check className="h-3 w-3" />}
              {state === "active" && isRunning && <Loader2 className="h-3 w-3 animate-spin" />}
              {state === "active" && !isRunning && <Check className="h-3 w-3" />}
              {state === "hold" && <AlertCircle className="h-3 w-3" />}
              {state === "pending" && (
                <div className="h-1.5 w-1.5 rounded-full bg-neutral-300" />
              )}
              <span>{phase.label}</span>
            </button>
            {!isLast && (
              <div
                className={cn(
                  "h-px w-3",
                  state === "done" ? "bg-status-success/40" : "bg-neutral-200"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
