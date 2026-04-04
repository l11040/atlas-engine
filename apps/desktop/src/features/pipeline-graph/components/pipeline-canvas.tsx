// 책임: ReactFlow 래퍼 + dagre 레이아웃 기반의 파이프라인 그래프 캔버스를 렌더한다.
import { useCallback } from "react";
import { ReactFlow, Background, Controls, type NodeTypes, type NodeMouseHandler } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Node, Edge } from "@xyflow/react";
import { AgentNode } from "./agent-node";
import { SkillNode } from "./skill-node";
import { GroupNode } from "./group-node";
import { InstanceGroupNode } from "./instance-group-node";

const nodeTypes: NodeTypes = {
  agent: AgentNode,
  skill: SkillNode,
  group: GroupNode,
  instanceGroup: InstanceGroupNode
};

interface PipelineCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodeSelect?: (nodeId: string | null, selectedLogId?: number | null, selectedLogType?: "agent" | "skill" | null) => void;
}

export function PipelineCanvas({ nodes, edges, onNodeSelect }: PipelineCanvasProps) {
  const handleNodeClick: NodeMouseHandler = useCallback(
    (event, node) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-node-interactive='true']")) {
        return;
      }

      const selectedNode = node as Node & {
        data?: {
          baseNodeId?: string;
          defaultSelectedLogId?: number | null;
          defaultSelectedLogType?: "agent" | "skill" | null;
        };
      };

      onNodeSelect?.(
        selectedNode.data?.baseNodeId ?? selectedNode.id,
        selectedNode.data?.defaultSelectedLogId ?? null,
        selectedNode.data?.defaultSelectedLogType ?? null
      );
    },
    [onNodeSelect]
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onPaneClick={() => onNodeSelect?.(null, null, null)}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        nodesDraggable={false}
        selectNodesOnDrag={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--color-neutral-200)" gap={20} size={1} />
        <Controls
          showInteractive={false}
          className="!rounded-[var(--radius-xs)] !border-border-subtle !bg-surface-base !shadow-sm"
        />

      </ReactFlow>
    </div>
  );
}
