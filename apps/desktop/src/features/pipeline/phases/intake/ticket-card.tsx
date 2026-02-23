// 책임: Ticket의 AC/시나리오 구조를 카드로 표시한다.
// AC↔TS 양방향 호버 하이라이트: AC 호버 시 관련 TS, TS의 AC 뱃지 호버 시 해당 AC 강조.

import { useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { Ticket } from "@shared/ipc";

interface TicketCardProps {
  ticket: Ticket;
}

export function TicketCard({ ticket }: TicketCardProps) {
  const [highlightedAc, setHighlightedAc] = useState<string | null>(null);

  // 목적: AC ID → 해당 AC를 커버하는 TS ID 집합을 미리 계산한다.
  const acToTsIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const ts of ticket.test_scenarios) {
      for (const acId of ts.covers) {
        if (!map.has(acId)) map.set(acId, new Set());
        map.get(acId)!.add(ts.id);
      }
    }
    return map;
  }, [ticket.test_scenarios]);

  const highlightedTsIds = highlightedAc ? acToTsIds.get(highlightedAc) ?? null : null;

  return (
    <div className="flex flex-col gap-4">
      {/* 헤더 */}
      <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-base px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-strong">{ticket.jira_key}</span>
          <Badge variant="outline" className="text-2xs">{ticket.mode}</Badge>
          {ticket.mode_locked && <Lock className="h-3 w-3 text-text-soft" />}
        </div>
        <p className="text-xs leading-relaxed text-text-muted">{ticket.summary}</p>
      </div>

      {/* AC / TS 2단 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 좌: Acceptance Criteria */}
        <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-base px-5 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-text-strong">인수 조건</h3>
            <span className="text-2xs text-text-soft">{ticket.acceptance_criteria.length}개</span>
          </div>

          {ticket.acceptance_criteria.map((ac, i) => (
            <div key={ac.id}>
              {i !== 0 && <Separator className="mb-3" />}
              <div
                className={cn(
                  "-mx-2 rounded-md px-2 py-2 transition-colors duration-150",
                  highlightedAc === ac.id && "bg-brand-50"
                )}
                onMouseEnter={() => setHighlightedAc(ac.id)}
                onMouseLeave={() => setHighlightedAc(null)}
              >
                <span className="font-mono text-2xs font-semibold text-brand-600">{ac.id}</span>
                <p className="mt-1 text-xs leading-[1.7] text-text-muted">{ac.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* 우: Test Scenarios */}
        <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-base px-5 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-text-strong">테스트 시나리오</h3>
            <span className="text-2xs text-text-soft">{ticket.test_scenarios.length}개</span>
          </div>

          {ticket.test_scenarios.map((ts, i) => (
            <div key={ts.id}>
              {i !== 0 && <Separator className="mb-3" />}
              <div
                className={cn(
                  "-mx-2 rounded-md px-2 py-2 transition-colors duration-150",
                  highlightedTsIds?.has(ts.id) && "bg-status-success/5"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-2xs font-semibold text-status-success">{ts.id}</span>
                  {ts.covers.map((acId) => (
                    <Badge
                      key={acId}
                      variant="outline"
                      className={cn(
                        "cursor-default px-1.5 py-0 font-mono text-2xs transition-colors duration-150",
                        highlightedAc === acId
                          ? "border-brand-500 bg-brand-50 text-brand-600"
                          : "text-text-soft"
                      )}
                      onMouseEnter={() => setHighlightedAc(acId)}
                      onMouseLeave={() => setHighlightedAc(null)}
                    >
                      {acId}
                    </Badge>
                  ))}
                </div>
                <p className="mt-1 text-xs leading-[1.7] text-text-muted">{ts.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
