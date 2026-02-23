// 책임: Ticket의 AC/시나리오 구조를 카드로 표시한다.

import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Ticket } from "@shared/ipc";

interface TicketCardProps {
  ticket: Ticket;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-2xs font-semibold uppercase tracking-wider text-text-soft">{children}</h3>;
}

export function TicketCard({ ticket }: TicketCardProps) {
  return (
    <div className="flex flex-col gap-4 rounded-md border border-border-subtle bg-surface-base p-4">
      {/* 헤더: jira_key + mode 뱃지 */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-text-strong">티켓</span>
        <Badge variant="outline" className="text-2xs">
          {ticket.jira_key}
        </Badge>
        <Badge variant="outline" className="text-2xs">
          {ticket.mode}
        </Badge>
        {ticket.mode_locked && (
          <Badge variant="secondary" className="gap-1 text-2xs">
            <Lock className="h-2.5 w-2.5" />
            잠금
          </Badge>
        )}
      </div>

      {/* 요약 */}
      <div className="flex flex-col gap-1">
        <SectionLabel>요약</SectionLabel>
        <p className="text-xs leading-relaxed text-text-muted">{ticket.summary}</p>
      </div>

      {/* Acceptance Criteria */}
      <div className="flex flex-col gap-1.5">
        <SectionLabel>인수 조건 (AC)</SectionLabel>
        <div className="flex flex-col gap-1">
          {ticket.acceptance_criteria.map((ac) => (
            <div key={ac.id} className="flex items-start gap-2">
              <Badge variant="outline" className="mt-0.5 shrink-0 font-mono text-2xs">
                {ac.id}
              </Badge>
              <span className="text-2xs leading-relaxed text-text-muted">{ac.description}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Test Scenarios */}
      <div className="flex flex-col gap-1.5">
        <SectionLabel>테스트 시나리오 (TS)</SectionLabel>
        <div className="flex flex-col gap-1.5">
          {ticket.test_scenarios.map((ts) => (
            <div key={ts.id} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="shrink-0 font-mono text-2xs">
                  {ts.id}
                </Badge>
                <div className="flex gap-1">
                  {ts.covers.map((acId) => (
                    <Badge key={acId} variant="secondary" className="font-mono text-2xs">
                      {acId}
                    </Badge>
                  ))}
                </div>
              </div>
              <span className="pl-1 text-2xs leading-relaxed text-text-muted">{ts.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
