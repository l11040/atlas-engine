// 책임: agent 타입 커스텀 노드를 렌더한다.
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot } from "lucide-react";
import { NodeStatusBadge } from "./node-status-badge";
import type { NodeStatus } from "@shared/ipc";

interface AgentNodeData {
  label: string;
  status: NodeStatus;
  hasIncoming?: boolean;
  hasOutgoing?: boolean;
  [key: string]: unknown;
}

export function AgentNode({ data, selected }: NodeProps) {
  const { label, status, hasIncoming = true, hasOutgoing = true } = data as unknown as AgentNodeData;
  const isRunning = status === "running";
  const selectedTextColor = `var(--color-node-${status}-border)`;
  const selectedBackground = `color-mix(in srgb, var(--color-node-${status}-bg) 72%, var(--color-surface-base))`;

  return (
    <div
      className="flex items-center gap-2 rounded-[var(--radius-sm)] border-2 px-3 py-2 shadow-xs transition-all"
      style={{
        background: selected ? selectedBackground : "var(--color-surface-base)",
        borderColor: `var(--color-node-${status}-border)`,
        boxShadow: isRunning
          ? "0 0 0 3px color-mix(in srgb, var(--color-node-running-border) 20%, transparent)"
          : undefined,
        minWidth: 160
      }}
    >
      {hasIncoming && (
        <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-none !bg-neutral-400" />
      )}
      <Bot className="h-4 w-4 shrink-0 text-text-muted" style={{ color: selected ? selectedTextColor : undefined }} />
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-xs font-semibold text-text-strong" style={{ color: selected ? selectedTextColor : undefined }}>
          {label}
        </span>
      </div>
      <NodeStatusBadge status={status} />
      {hasOutgoing && (
        <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-none !bg-neutral-400" />
      )}
    </div>
  );
}
