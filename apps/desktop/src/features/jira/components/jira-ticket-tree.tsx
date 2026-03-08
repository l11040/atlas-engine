// 책임: Jira 티켓 트리를 계층 구조로 표시한다.

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JiraTicket, JiraTicketTree } from "@shared/ipc";

interface JiraTicketTreeViewProps {
  tree: JiraTicketTree;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

// 목적: issuetype에 따른 배지 약어와 색상을 결정한다.
function issueTypeBadge(issuetype: string): { label: string; className: string } {
  const lower = issuetype.toLowerCase();
  if (lower === "에픽" || lower === "epic") return { label: "E", className: "bg-violet-100 text-violet-600" };
  if (lower === "스토리" || lower === "story") return { label: "S", className: "bg-emerald-100 text-emerald-600" };
  if (lower.includes("sub-task") || lower === "하위 작업") return { label: "T", className: "bg-sky-100 text-sky-600" };
  return { label: issuetype.charAt(0), className: "bg-neutral-100 text-neutral-500" };
}

function TicketNode({
  ticket,
  tree,
  depth,
  selectedKey,
  onSelect
}: {
  ticket: JiraTicket;
  tree: JiraTicketTree;
  depth: number;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const children = ticket.subtasks.filter((key) => tree.tickets[key]);
  const hasChildren = children.length > 0;
  const isSelected = selectedKey === ticket.key;

  return (
    <div>
      <div
        className={cn(
          "group flex cursor-pointer items-center gap-1.5 py-[3px] pr-2 transition-colors hover:bg-surface-subtle",
          isSelected && "bg-brand-50"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(ticket.key)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center text-text-soft"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}

        <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold leading-none", issueTypeBadge(ticket.issuetype).className)}>
          {issueTypeBadge(ticket.issuetype).label}
        </span>
        <span className="shrink-0 text-2xs text-text-muted">{ticket.key}</span>
        <span className="min-w-0 truncate text-xs text-text-strong">{ticket.summary}</span>
      </div>

      {expanded && hasChildren && (
        <div>
          {children.map((key) => {
            const child = tree.tickets[key];
            if (!child) return null;
            return (
              <TicketNode
                key={key}
                ticket={child}
                tree={tree}
                depth={depth + 1}
                selectedKey={selectedKey}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function JiraTicketTreeView({ tree, selectedKey, onSelect }: JiraTicketTreeViewProps) {
  const rootTicket = tree.tickets[tree.root];

  if (!rootTicket) {
    return <div className="py-8 text-center text-xs text-text-soft">루트 이슈를 찾을 수 없습니다</div>;
  }

  return (
    <div className="rounded-md border border-border-subtle py-1">
      <TicketNode ticket={rootTicket} tree={tree} depth={0} selectedKey={selectedKey} onSelect={onSelect} />
    </div>
  );
}
