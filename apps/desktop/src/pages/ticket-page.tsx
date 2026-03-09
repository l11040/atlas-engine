// 책임: 티켓 상세 + 실행 플로우를 하나의 페이지에서 관리한다.

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BottomDrawer } from "@/components/bottom-drawer";
import { useHeaderLeft } from "@/components/app-layout";
import { useBottomDrawer } from "@/hooks/use-bottom-drawer";
import { JiraTicketTreeView } from "@/features/jira/components/jira-ticket-tree";
import { JiraTicketDetail } from "@/features/jira/components/jira-ticket-detail";
import { useRunState } from "@/features/automation/hooks/use-run-state";
import { useTaskStates } from "@/features/automation/hooks/use-task-states";
import { RunProcessBar } from "@/features/automation/components/run-process-bar";
import { RunLogPanel } from "@/features/automation/components/run-log-panel";
import { AnalysisView } from "@/features/automation/phases/analysis-view";
import { RiskView } from "@/features/automation/phases/risk-view";
import { PlanView } from "@/features/automation/phases/plan-view";
import { ExecutionView } from "@/features/automation/phases/execution-view";
import type { JiraTicketTree, RunStep } from "@shared/ipc";

export default function TicketPage() {
  const { ticketKey } = useParams<{ ticketKey: string }>();
  const navigate = useNavigate();
  const setHeaderLeft = useHeaderLeft();
  const [tree, setTree] = useState<JiraTicketTree | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStep, setSelectedStep] = useState<RunStep>("ingestion");

  const { runState } = useRunState();
  const { taskStates } = useTaskStates();
  const { setStatusText } = useBottomDrawer();

  // 목적: 현재 티켓에 대한 실행이 진행 중인지 판별한다.
  const isRunActive = runState != null && runState.ticketId === ticketKey && runState.status === "running";
  const runForTicket = runState?.ticketId === ticketKey ? runState : null;

  // 목적: 실행 스텝이 진행되면 선택된 탭을 자동으로 따라간다.
  const currentStep = runForTicket?.currentStep;
  useEffect(() => {
    if (currentStep && currentStep !== "idle") {
      setSelectedStep(currentStep);
    }
  }, [currentStep]);

  // 목적: 실행 상태에 따라 하단 드로어 상태 바 텍스트를 갱신한다.
  useEffect(() => {
    if (!runForTicket) {
      setStatusText("");
      return;
    }
    if (runForTicket.status === "running" && currentStep) {
      const stepLabels: Record<string, string> = {
        idle: "대기 중",
        ingestion: "데이터 수집 중",
        analyze: "요구사항 분석 중",
        risk: "위험 평가 중",
        plan: "실행 계획 수립 중",
        execution: "작업 실행 중",
        archiving: "결과 저장 중",
        done: "완료",
      };
      setStatusText(stepLabels[currentStep] ?? `${currentStep} 진행 중`);
    } else if (runForTicket.status === "completed") {
      setStatusText("실행 완료");
    } else if (runForTicket.status === "failed") {
      setStatusText("실행 실패");
    }
  }, [runForTicket, currentStep, setStatusText]);

  // 목적: 헤더 좌측에 뒤로가기 + 티켓 키만 표시한다.
  useEffect(() => {
    setHeaderLeft(
      <>
        <button
          onClick={() => navigate("/")}
          className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:text-text-strong"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-text-strong">{ticketKey}</span>
      </>
    );
    return () => setHeaderLeft(null);
  }, [setHeaderLeft, navigate, ticketKey]);

  // 목적: 현재 ticketKey를 포함하는 트리를 찾아 로드한다.
  useEffect(() => {
    if (!ticketKey) return;
    window.atlas.getAllJiraTicketTrees().then((trees) => {
      const found = trees.find((t) => t.tickets[ticketKey]);
      if (found) setTree(found);
    });
  }, [ticketKey]);

  // 목적: 트리에서 선택한 티켓 키를 로컬 상태로 관리한다 (페이지 이동 없이).
  const [selectedKey, setSelectedKey] = useState<string>(ticketKey ?? "");
  useEffect(() => { setSelectedKey(ticketKey ?? ""); }, [ticketKey]);

  const ticket = tree ? tree.tickets[selectedKey] ?? null : null;

  async function handleStartRun() {
    if (!ticketKey) return;
    setStarting(true);
    setError(null);
    try {
      const res = await window.atlas.startRun({ ticketId: ticketKey });
      if (res.status !== "accepted") {
        setError(res.message ?? "실행 시작 실패");
      }
    } catch {
      setError("실행 시작 실패");
    } finally {
      setStarting(false);
    }
  }

  async function handleCancelRun() {
    if (!runState) return;
    await window.atlas.cancelRun({ runId: runState.runId });
  }

  if (!tree) {
    return <p className="text-xs text-text-soft py-8">로딩 중...</p>;
  }

  if (!ticket) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <p className="text-xs text-text-soft">티켓을 찾을 수 없습니다: {ticketKey}</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/")}>
          돌아가기
        </Button>
      </div>
    );
  }

  // 목적: 선택된 스텝에 따라 우측 패널 콘텐츠를 결정한다.
  function renderStepContent() {
    // 목적: 수집 단계 — 트리 + 티켓 상세를 보여준다.
    if (selectedStep === "ingestion") {
      return (
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="w-2/5 shrink-0 overflow-auto">
            <JiraTicketTreeView
              tree={tree!}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
            />
          </div>
          <div className="flex-1 overflow-auto">
            <JiraTicketDetail ticket={ticket!} />
          </div>
        </div>
      );
    }

    // 목적: 해석 단계 — 요구사항 분석 결과를 보여준다.
    if (selectedStep === "analyze") {
      if (!runForTicket?.parsedRequirements) {
        return <StepPlaceholder label="요구사항 분석 결과가 여기에 표시됩니다" />;
      }
      return <AnalysisView requirements={runForTicket.parsedRequirements} />;
    }

    // 목적: 위험 단계 — 위험 평가 결과를 보여준다.
    if (selectedStep === "risk") {
      if (!runForTicket?.riskAssessment) {
        return <StepPlaceholder label="위험 평가 결과가 여기에 표시됩니다" />;
      }
      return <RiskView assessment={runForTicket.riskAssessment} />;
    }

    // 목적: 계획 단계 — 실행 계획을 보여준다.
    if (selectedStep === "plan") {
      if (!runForTicket?.executionPlan) {
        return <StepPlaceholder label="실행 계획이 여기에 표시됩니다" />;
      }
      return <PlanView plan={runForTicket.executionPlan} taskStates={taskStates} />;
    }

    // 목적: 실행 단계 — 태스크 실행 현황을 보여준다.
    if (selectedStep === "execution") {
      if (!runForTicket?.executionPlan) {
        return <StepPlaceholder label="작업 실행 현황이 여기에 표시됩니다" />;
      }
      return <ExecutionView plan={runForTicket.executionPlan} taskStates={taskStates} />;
    }

    // 목적: 저장/완료 단계 — 완료 메시지를 보여준다.
    if (selectedStep === "archiving" || selectedStep === "done") {
      const isDone = runForTicket?.status === "completed";
      return (
        <StepPlaceholder
          label={isDone ? "모든 작업이 완료되었습니다" : "결과를 저장하는 중입니다"}
        />
      );
    }

    return <StepPlaceholder label="단계를 선택하세요" />;
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <RunProcessBar
        run={runForTicket}
        isRunning={isRunActive}
        starting={starting}
        error={error}
        selectedStep={selectedStep}
        onSelectStep={setSelectedStep}
        onStart={handleStartRun}
        onCancel={handleCancelRun}
      />

      {renderStepContent()}

      <BottomDrawer isRunning={isRunActive}>
        <RunLogPanel run={runForTicket} taskStates={taskStates} />
      </BottomDrawer>
    </div>
  );
}

// 목적: 데이터가 아직 없는 스텝의 빈 상태를 표시한다.
function StepPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border-subtle py-16">
      <p className="text-xs text-text-soft">{label}</p>
    </div>
  );
}
