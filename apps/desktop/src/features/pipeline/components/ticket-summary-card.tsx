// 책임: 메인 페이지에서 티켓 요약 정보와 파이프라인 진입 버튼을 표시한다.

import { useNavigate } from "react-router-dom";
import { ArrowRight, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PipelineState, Ticket } from "@shared/ipc";

interface TicketSummaryCardProps {
  ticket: Ticket;
  pipeline?: PipelineState;
}

export function TicketSummaryCard({ ticket, pipeline }: TicketSummaryCardProps) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border-subtle bg-surface-base p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-brand-500" />
          <span className="text-sm font-semibold text-text-strong">{ticket.jira_key}</span>
          <Badge variant="outline" className="text-2xs">{ticket.mode}</Badge>
        </div>
        {pipeline && (
          <Badge variant="outline" className="text-2xs text-status-success">
            파이프라인 실행됨
          </Badge>
        )}
      </div>

      <p className="text-xs leading-relaxed text-text-muted">{ticket.summary}</p>

      <div className="flex items-center justify-between text-2xs text-text-soft">
        <span>AC {ticket.acceptance_criteria.length}개 · 시나리오 {ticket.test_scenarios.length}개</span>
      </div>

      <Button
        size="sm"
        className="gap-1.5 self-end text-xs"
        onClick={() => navigate("/pipeline")}
      >
        <Zap className="h-3 w-3" />
        {pipeline ? "파이프라인 보기" : "파이프라인 시작"}
        <ArrowRight className="h-3 w-3" />
      </Button>
    </div>
  );
}
