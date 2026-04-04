// 책임: skill 타입 커스텀 노드를 렌더한다.
import { type NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";
import { NodeStatusBadge } from "./node-status-badge";
import type { NodeStatus } from "@shared/ipc";

interface SkillNodeData {
  label: string;
  status: NodeStatus;
  [key: string]: unknown;
}

export function SkillNode({ data, selected }: NodeProps) {
  const { label, status } = data as unknown as SkillNodeData;
  const isRunning = status === "running";
  const selectedTextColor = `var(--color-node-${status}-border)`;
  const selectedBackground = `color-mix(in srgb, var(--color-node-${status}-bg) 76%, var(--color-surface-base))`;

  return (
    <div
      className="box-border flex h-full w-full min-w-0 items-center gap-3 rounded-[var(--radius-xs)] border px-4 py-3 shadow-xs transition-all"
      style={{
        background: selected ? selectedBackground : "var(--color-surface-base)",
        borderColor: `var(--color-node-${status}-border)`,
        boxShadow: isRunning
          ? "0 0 0 2px color-mix(in srgb, var(--color-node-running-border) 20%, transparent)"
          : undefined
      }}
    >
      <Zap className="h-4 w-4 shrink-0 text-text-muted" style={{ color: selected ? selectedTextColor : undefined }} />
      <span className="min-w-0 flex-1 truncate text-xs font-medium tracking-tight text-text-strong" style={{ color: selected ? selectedTextColor : undefined }}>
        {label}
      </span>
      <NodeStatusBadge status={status} />
    </div>
  );
}
