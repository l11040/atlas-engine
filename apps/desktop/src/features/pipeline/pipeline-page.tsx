// 책임: Ticket 파이프라인 화면. 결과를 설정에 저장하고, phase 클릭으로 이전 결과를 탐색한다.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Play, RotateCcw, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PhasePipeline } from "./components/phase-pipeline";
import { PhaseContent } from "./components/phase-content";
import { useLangchainFlow } from "./hooks/use-langchain-flow";
import { usePipelineOrchestration, PHASE_TO_START_NODE } from "./hooks/use-pipeline-orchestration";
import type { AppSettings, PipelinePhase } from "@shared/ipc";

export default function PipelinePage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPhase, setSelectedPhase] = useState<PipelinePhase | null>(null);

  const { status, nodes, result, error, invoke } = useLangchainFlow(
    settings?.activeProvider ?? "claude"
  );

  const { phaseData, currentPhase, holdAtPhase, setRerunFromPhase } =
    usePipelineOrchestration({ settings, setSettings, status, nodes, result });

  // 목적: 마운트 시 설정을 로드하고, 저장된 파이프라인 상태가 있으면 마지막 phase를 선택한다.
  useEffect(() => {
    window.atlas.getConfig().then((config) => {
      setSettings(config);
      setLoading(false);
      if (config.pipeline) {
        setSelectedPhase(config.pipeline.currentPhase);
      }
    });
  }, []);

  // 목적: 실행 중일 때 selectedPhase가 currentPhase를 자동 추적한다.
  useEffect(() => {
    if (status === "running") {
      setSelectedPhase(currentPhase);
    }
  }, [currentPhase, status]);

  // 목적: flow 완료 시 selectedPhase를 최종 phase로 설정한다.
  useEffect(() => {
    if (status === "completed" || (status === "error" && nodes.length > 0)) {
      setSelectedPhase(currentPhase);
    }
  }, [status]);

  async function handleGenerateTodos() {
    if (!settings?.ticket) return;
    setRerunFromPhase(null);
    setSelectedPhase("intake");
    await invoke("", settings.defaultCwd, settings.activeProvider, "ticket-to-todo");
  }

  // 목적: 선택한 phase부터 파이프라인을 재실행한다.
  async function handleRerunFrom(phase: PipelinePhase) {
    if (!settings?.ticket) return;
    // 목적: hold 상태에서 재실행 시 holdAtPhase 기준으로 시작 노드를 결정한다.
    const targetPhase = phase === "hold" && holdAtPhase ? holdAtPhase : phase;
    const startNode = PHASE_TO_START_NODE[targetPhase];
    if (!startNode) return;
    setRerunFromPhase(targetPhase);
    setSelectedPhase(targetPhase);
    await invoke("", settings.defaultCwd, settings.activeProvider, "ticket-to-todo", startNode);
  }

  if (loading) {
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

  const isRunning = status === "running";
  const isCompleted = status === "completed" || (status === "idle" && !!settings.pipeline);
  const isHold = currentPhase === "hold";
  const hasPipeline = status !== "idle" || !!settings.pipeline;
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
              {status === "error" && !isHold && (
                <Badge variant="outline" className="text-2xs text-status-danger">오류</Badge>
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
              holdAtPhase={holdAtPhase}
              isRunning={isRunning}
              onPhaseClick={setSelectedPhase}
            />
          )}
        </div>

        {/* 에러 표시 */}
        {error && (
          <div className="rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-xs text-status-danger">
            {error}
          </div>
        )}

        {/* Phase별 콘텐츠 */}
        <PhaseContent viewPhase={viewPhase} phaseData={phaseData} ticket={settings.ticket} />
      </div>

    </>
  );
}
