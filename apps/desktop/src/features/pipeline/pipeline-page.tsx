// 책임: Ticket 파이프라인 화면. 결과를 설정에 저장하고, phase 클릭으로 이전 결과를 탐색한다.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Play, RotateCcw, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PhasePipeline } from "./components/phase-pipeline";
import { PhaseContent } from "./components/phase-content";
import { useFlowState, PHASE_TO_START_NODE } from "./hooks/use-flow-state";
import type { AppSettings, PipelinePhase } from "@shared/ipc";

export default function PipelinePage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [selectedPhase, setSelectedPhase] = useState<PipelinePhase | null>(null);

  const { flowState, phaseData, loading: flowLoading, invoke } =
    useFlowState(settings);

  // 목적: 마운트 시 설정을 로드하고, 저장된 파이프라인 상태가 있으면 마지막 phase를 선택한다.
  useEffect(() => {
    window.atlas.getConfig().then((config) => {
      setSettings(config);
      setSettingsLoading(false);
      if (config.pipeline) {
        setSelectedPhase(config.pipeline.currentPhase);
      }
    });
  }, []);

  const currentPhase = flowState.currentPhase;
  const holdAtPhase = flowState.holdAtPhase ?? null;
  const isRunning = flowState.status === "running";
  const isInterrupted = flowState.status === "interrupted";
  const isError = flowState.status === "error";

  // 목적: 실행 중일 때 selectedPhase가 currentPhase를 자동 추적한다.
  useEffect(() => {
    if (isRunning) {
      setSelectedPhase(currentPhase);
    }
  }, [currentPhase, isRunning]);

  // 목적: flow 완료 시 selectedPhase를 최종 phase로 설정한다.
  useEffect(() => {
    if (flowState.status === "completed" || (isError && flowState.nodeProgress.length > 0)) {
      setSelectedPhase(currentPhase);
    }
  }, [flowState.status]);

  async function handleGenerateTodos() {
    if (!settings?.ticket) return;
    setSelectedPhase("intake");
    await invoke({
      flowId: crypto.randomUUID(),
      flowType: "ticket-to-todo",
      provider: settings.activeProvider,
      prompt: "",
      cwd: settings.defaultCwd
    });
  }

  // 목적: 선택한 phase부터 파이프라인을 재실행한다.
  async function handleRerunFrom(phase: PipelinePhase) {
    if (!settings?.ticket) return;
    const targetPhase = phase === "hold" && holdAtPhase ? holdAtPhase : phase;
    const startNode = PHASE_TO_START_NODE[targetPhase];
    if (!startNode) return;
    setSelectedPhase(targetPhase);
    await invoke({
      flowId: crypto.randomUUID(),
      flowType: "ticket-to-todo",
      provider: settings.activeProvider,
      prompt: "",
      cwd: settings.defaultCwd,
      startFromNode: startNode
    });
  }

  if (settingsLoading || flowLoading) {
    return <div className="flex items-center justify-center py-16 text-xs text-text-soft">로딩 중...</div>;
  }

  if (!settings?.ticket) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <p className="text-sm text-text-muted">티켓이 설정되지 않았습니다.</p>
        <Button variant="outline" size="sm" className="text-xs text-brand-500 underline" onClick={() => navigate("/settings")}>
          설정에서 티켓 JSON을 입력하세요
        </Button>
      </div>
    );
  }

  const isCompleted = flowState.status === "completed" || (flowState.status === "idle" && !!settings.pipeline);
  const isHold = currentPhase === "hold";
  const hasPipeline = flowState.status !== "idle" || !!settings.pipeline;
  const viewPhase = selectedPhase ?? currentPhase;

  return (
    <>
      <header className="flex items-center gap-3">
        <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold text-text-strong">Ticket → Todo 변환</span>
      </header>

      <div className="flex flex-col gap-5">
        {/* 상단: 실행 헤더 + Phase Pipeline */}
        <div className="flex flex-col gap-3 rounded-md border border-border-subtle bg-surface-base p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-brand-500" />
                <span className="text-sm font-semibold text-text-strong">파이프라인</span>
              </div>
              {isRunning && (
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-status-success" />
                  <span className="text-xs font-medium text-status-success">실행 중</span>
                </div>
              )}
              {isCompleted && !isHold && (
                <Badge variant="outline" className="text-2xs text-status-success">완료</Badge>
              )}
              {isHold && (
                <Badge variant="outline" className="text-2xs text-status-warning">hold</Badge>
              )}
              {isError && !isHold && (
                <Badge variant="outline" className="text-2xs text-status-danger">오류</Badge>
              )}
              {isInterrupted && (
                <Badge variant="outline" className="text-2xs text-status-warning">중단됨</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-2xs">{settings.ticket.mode}</Badge>
              {!isRunning && hasPipeline && viewPhase !== "idle" && viewPhase !== "intake" && PHASE_TO_START_NODE[viewPhase === "hold" && holdAtPhase ? holdAtPhase : viewPhase] && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 whitespace-nowrap text-xs"
                  onClick={() => handleRerunFrom(viewPhase)}
                >
                  <RotateCcw className="h-3 w-3" />
                  재실행
                </Button>
              )}
              {!hasPipeline && (
                <Button size="sm" className="h-7 gap-1 text-xs" onClick={handleGenerateTodos}>
                  <Play className="h-3 w-3" />
                  Todo 생성
                </Button>
              )}
            </div>
          </div>

          {hasPipeline && (
            <PhasePipeline
              currentPhase={currentPhase}
              selectedPhase={viewPhase !== "idle" ? viewPhase : undefined}
              holdAtPhase={holdAtPhase ?? undefined}
              isRunning={isRunning}
              onPhaseClick={setSelectedPhase}
            />
          )}
        </div>

        {/* interrupted 경고 배너 */}
        {isInterrupted && (
          <div className="rounded-md border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs text-status-warning">
            앱이 비정상 종료되어 실행이 중단되었습니다. 부분 결과를 확인하거나 재실행하세요.
          </div>
        )}

        {/* 에러 표시 */}
        {flowState.error && (
          <div className="rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-xs text-status-danger">
            {flowState.error}
          </div>
        )}

        {/* Phase별 콘텐츠 */}
        <PhaseContent viewPhase={viewPhase} phaseData={phaseData} ticket={settings.ticket} />
      </div>

    </>
  );
}
