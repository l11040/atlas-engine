// 책임: LangChain 플로우 실행 상태를 관리하고 FlowEvent 리스너로 UI 상태를 갱신한다.

import { useCallback, useEffect, useRef, useState } from "react";
import type { FlowEvent, FlowMetadata, ProviderType } from "../../shared/ipc";

export type FlowStatus = "idle" | "running" | "completed" | "error";

export type FlowNodeStatus = "pending" | "running" | "completed" | "error";

export interface FlowNodeState {
  nodeId: string;
  nodeName: string;
  status: FlowNodeStatus;
  input?: string;
  streamedText: string;
  output?: string;
  error?: string;
  metadata?: FlowMetadata;
}

export function useLangchainFlow(defaultProvider: ProviderType = "claude") {
  const [status, setStatus] = useState<FlowStatus>("idle");
  const [nodes, setNodes] = useState<FlowNodeState[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<FlowMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flowIdRef = useRef<string | null>(null);
  // 이유: React Strict Mode에서 effect 중복 등록을 방지한다.
  const didSetupRef = useRef(false);

  // 목적: onFlowEvent 리스너를 등록하여 현재 플로우의 이벤트만 처리한다.
  useEffect(() => {
    if (didSetupRef.current) return;
    didSetupRef.current = true;

    const unsub = window.atlas.onFlowEvent((event: FlowEvent) => {
      if (event.flowId !== flowIdRef.current) return;

      switch (event.type) {
        case "flow-start":
          setStatus("running");
          break;

        case "node-start":
          setNodes((prev) => [
            ...prev,
            {
              nodeId: event.nodeId,
              nodeName: event.nodeName,
              status: "running",
              input: event.input,
              streamedText: ""
            }
          ]);
          break;

        case "node-stream":
          setNodes((prev) =>
            prev.map((node) =>
              node.nodeId === event.nodeId ? { ...node, streamedText: node.streamedText + event.chunk } : node
            )
          );
          break;

        case "node-end":
          setNodes((prev) =>
            prev.map((node) =>
              node.nodeId === event.nodeId
                ? { ...node, status: "completed", output: event.output, metadata: event.metadata }
                : node
            )
          );
          break;

        case "node-error":
          setNodes((prev) =>
            prev.map((node) =>
              node.nodeId === event.nodeId ? { ...node, status: "error", error: event.error } : node
            )
          );
          break;

        case "flow-end":
          setResult(event.result);
          if (event.metadata) setMetadata(event.metadata);
          setStatus("completed");
          break;

        case "flow-error":
          setError(event.error);
          setStatus("error");
          break;
      }
    });

    return () => {
      unsub();
      didSetupRef.current = false;
    };
  }, []);

  const invoke = useCallback(
    async (prompt: string, cwd?: string, provider?: ProviderType) => {
      const id = crypto.randomUUID();
      flowIdRef.current = id;
      setNodes([]);
      setResult(null);
      setMetadata(null);
      setError(null);
      setStatus("running");

      const res = await window.atlas.invokeFlow({
        flowId: id,
        provider: provider ?? defaultProvider,
        prompt: prompt.trim(),
        ...(cwd ? { cwd } : {})
      });

      if (res.status === "rejected") {
        setError(res.message ?? "요청이 거부되었습니다.");
        setStatus("error");
      }
    },
    [defaultProvider]
  );

  const cancel = useCallback(async () => {
    if (!flowIdRef.current) return;
    await window.atlas.cancelFlow({ flowId: flowIdRef.current });
  }, []);

  const reset = useCallback(() => {
    flowIdRef.current = null;
    setNodes([]);
    setResult(null);
    setMetadata(null);
    setError(null);
    setStatus("idle");
  }, []);

  return { status, nodes, result, metadata, error, invoke, cancel, reset };
}
