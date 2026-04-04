import type { NodeProps } from "@xyflow/react";
import type { NodeStatus } from "@shared/ipc";
import { NodeStatusBadge } from "./node-status-badge";

interface InstanceGroupNodeData {
  label: string;
  status: NodeStatus;
  itemCount?: number;
  [key: string]: unknown;
}

export function InstanceGroupNode({ data, selected }: NodeProps) {
  const { label, status, itemCount = 0 } = data as unknown as InstanceGroupNodeData;
  const selectedTextColor = `var(--color-node-${status}-border)`;
  const selectedBackground = `color-mix(in srgb, var(--color-node-${status}-bg) 78%, var(--color-surface-base))`;
  const defaultBackground = "color-mix(in srgb, var(--color-surface-base) 88%, var(--color-brand-50))";

  return (
    <div
      className="box-border h-full w-full rounded-[var(--radius-xs)] border"
      style={{
        background: selected ? selectedBackground : defaultBackground,
        borderColor: `var(--color-node-${status}-border)`,
        boxShadow: status === "running"
          ? "0 0 0 2px color-mix(in srgb, var(--color-node-running-border) 18%, transparent)"
          : undefined
      }}
    >
      <div className="flex items-center gap-3 border-b border-[var(--color-border-subtle)] px-4 py-3">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold tracking-tight text-text-muted" style={{ color: selected ? selectedTextColor : undefined }}>
          {label}
        </span>
        <NodeStatusBadge status={status} />
      </div>
      {itemCount === 0 && (
        <div className="px-4 py-3 text-xs text-text-muted">No child skills</div>
      )}
    </div>
  );
}
