// 책임: 선택된 Jira 티켓의 상세 정보를 표시한다.

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { JiraTicket } from "@shared/ipc";

// 목적: issuetype에 따른 배지 약어와 색상을 결정한다.
function issueTypeBadge(issuetype: string): { label: string; className: string } {
  const lower = issuetype.toLowerCase();
  if (lower === "에픽" || lower === "epic") return { label: "E", className: "bg-violet-100 text-violet-600" };
  if (lower === "스토리" || lower === "story") return { label: "S", className: "bg-emerald-100 text-emerald-600" };
  if (lower.includes("sub-task") || lower === "하위 작업") return { label: "T", className: "bg-sky-100 text-sky-600" };
  return { label: issuetype.charAt(0), className: "bg-neutral-100 text-neutral-500" };
}

interface JiraTicketDetailProps {
  ticket: JiraTicket;
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-20 shrink-0 text-2xs font-medium text-text-soft">{label}</span>
      <span className="text-xs text-text-strong">{children}</span>
    </div>
  );
}

export function JiraTicketDetail({ ticket }: JiraTicketDetailProps) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border-subtle bg-surface-base p-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold leading-none", issueTypeBadge(ticket.issuetype).className)}>
            {issueTypeBadge(ticket.issuetype).label}
          </span>
          <span className="text-xs font-semibold text-text-strong">{ticket.key}</span>
          <span className="text-2xs text-text-muted">{ticket.issuetype}</span>
        </div>
        <span className="text-sm font-medium text-text-strong">{ticket.summary}</span>
      </div>

      <Separator className="bg-border-subtle" />

      <div className="flex flex-col gap-2">
        <InfoRow label="상태">{ticket.status}</InfoRow>
        <InfoRow label="우선순위">{ticket.priority}</InfoRow>
        {ticket.assignee && <InfoRow label="담당자">{ticket.assignee}</InfoRow>}
        {ticket.reporter && <InfoRow label="보고자">{ticket.reporter}</InfoRow>}
        {ticket.parent && <InfoRow label="상위 이슈">{ticket.parent}</InfoRow>}
        {ticket.labels.length > 0 && (
          <InfoRow label="라벨">
            <div className="flex flex-wrap gap-1">
              {ticket.labels.map((label) => (
                <Badge key={label} variant="outline" className="text-2xs px-1.5 py-0">{label}</Badge>
              ))}
            </div>
          </InfoRow>
        )}
        {ticket.links.length > 0 && (
          <InfoRow label="링크">
            <div className="flex flex-col gap-0.5">
              {ticket.links.map((link, i) => (
                <span key={i} className="text-xs text-text-muted">
                  {link.type} ({link.direction}) → {link.key}
                </span>
              ))}
            </div>
          </InfoRow>
        )}
        <InfoRow label="생성일">{new Date(ticket.created).toLocaleString("ko-KR")}</InfoRow>
        <InfoRow label="수정일">{new Date(ticket.updated).toLocaleString("ko-KR")}</InfoRow>
      </div>

      {ticket.description && (
        <>
          <Separator className="bg-border-subtle" />
          <div className="flex flex-col gap-1.5">
            <span className="text-2xs font-medium text-text-soft">설명</span>
            <div className="text-xs leading-relaxed text-text-strong prose prose-xs prose-neutral max-w-none">
              <Markdown remarkPlugins={[remarkGfm]}>{ticket.description}</Markdown>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
