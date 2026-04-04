// 책임: 노드 상태를 Badge로 표시한다.
import { Badge } from "@/components/ui/badge";
import type { NodeStatus } from "@shared/ipc";

const STATUS_CONFIG: Record<NodeStatus, { label: string; className: string }> = {
  pending: { label: "대기", className: "border-[var(--color-node-pending-border)] text-text-soft bg-[var(--color-node-pending-bg)]" },
  running: { label: "실행 중", className: "border-[var(--color-node-running-border)] text-[var(--color-node-running-border)] bg-[var(--color-node-running-bg)]" },
  completed: { label: "완료", className: "border-[var(--color-node-completed-border)] text-[var(--color-node-completed-border)] bg-[var(--color-node-completed-bg)]" },
  failed: { label: "실패", className: "border-[var(--color-node-failed-border)] text-[var(--color-node-failed-border)] bg-[var(--color-node-failed-bg)]" }
};

interface NodeStatusBadgeProps {
  status: NodeStatus;
}

export function NodeStatusBadge({ status }: NodeStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={`shrink-0 py-0 text-2xs ${config.className}`}>
      {config.label}
    </Badge>
  );
}
