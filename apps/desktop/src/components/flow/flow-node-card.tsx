// 책임: LangChain 플로우의 개별 노드를 카드 형태로 시각화한다.

import { Badge } from "@/components/ui/badge";
import type { FlowNodeState, FlowNodeStatus } from "@/hooks/use-langchain-flow";
import { Loader2 } from "lucide-react";

// 목적: 노드 상태에 따른 Badge variant와 라벨을 매핑한다.
const STATUS_MAP: Record<FlowNodeStatus, { label: string; className: string }> = {
  pending: { label: "대기", className: "bg-[var(--color-neutral-200)] text-[var(--color-text-muted)]" },
  running: { label: "실행 중", className: "bg-[var(--color-brand-100)] text-[var(--color-brand-700)]" },
  completed: { label: "완료", className: "bg-[var(--color-diff-addition-bg)] text-[var(--color-diff-addition-text)]" },
  error: { label: "오류", className: "bg-[var(--color-diff-deletion-bg)] text-[var(--color-diff-deletion-text)]" }
};

interface FlowNodeCardProps {
  node: FlowNodeState;
}

export function FlowNodeCard({ node }: FlowNodeCardProps) {
  const statusInfo = STATUS_MAP[node.status];
  const displayText = node.status === "running" ? node.streamedText : (node.output ?? node.streamedText);

  return (
    <div className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] p-[var(--space-3)] shadow-[var(--shadow-xs)]">
      <div className="flex items-center gap-[var(--space-2)]">
        <span className="text-[var(--font-size-sm)] font-[var(--font-weight-semibold)] text-[var(--color-text-strong)]">
          {node.nodeName}
        </span>
        <Badge className={statusInfo.className}>
          {node.status === "running" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {statusInfo.label}
        </Badge>
      </div>

      {node.input && (
        <div className="rounded-[var(--radius-xs)] bg-[var(--color-surface-subtle)] p-[var(--space-2)]">
          <p className="text-[var(--font-size-2xs)] text-[var(--color-text-soft)]">입력</p>
          <p className="mt-[var(--space-1)] line-clamp-3 text-[var(--font-size-xs)] text-[var(--color-text-muted)]">
            {node.input}
          </p>
        </div>
      )}

      {displayText && (
        <div className="rounded-[var(--radius-xs)] bg-[var(--color-surface-subtle)] p-[var(--space-2)]">
          <p className="text-[var(--font-size-2xs)] text-[var(--color-text-soft)]">출력</p>
          <p className="mt-[var(--space-1)] whitespace-pre-wrap text-[var(--font-size-xs)] text-[var(--color-text-muted)]">
            {displayText}
          </p>
        </div>
      )}

      {node.error && (
        <p className="text-[var(--font-size-xs)] text-[var(--color-status-danger)]">{node.error}</p>
      )}
    </div>
  );
}
