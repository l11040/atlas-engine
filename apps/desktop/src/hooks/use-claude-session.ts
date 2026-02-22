// 책임: Claude CLI 실행 세션의 상태·타임라인·결과를 관리한다.

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClaudeEvent,
  StreamJsonEvent,
  StreamJsonResult,
  StreamJsonToolUse
} from "../../shared/ipc";

export type SessionStatus = "idle" | "running" | "completed" | "failed" | "cancelled";

export interface ToolTimelineEntry {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  result?: string;
  timestamp: number;
  completedAt?: number;
}

// 목적: tool_use 이벤트에서 파일 경로를 추출하는 도구 목록과 필드 매핑
const FILE_PATH_TOOLS: Record<string, string> = {
  Read: "file_path",
  Write: "file_path",
  Edit: "file_path",
  MultiEdit: "file_path"
};

export function useClaudeSession() {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [toolTimeline, setToolTimeline] = useState<ToolTimelineEntry[]>([]);
  const [assistantText, setAssistantText] = useState("");
  const [costUsd, setCostUsd] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requestIdRef = useRef<string | null>(null);
  const touchedFilesRef = useRef<Set<string>>(new Set());
  // 이유: React Strict Mode에서 effect 중복 등록을 방지한다.
  const didSetupRef = useRef(false);

  // 목적: stream-event에서 도구 사용을 타임라인에 추가한다.
  const handleToolUse = useCallback((block: StreamJsonToolUse) => {
    setToolTimeline((prev) => [
      ...prev,
      {
        id: block.id,
        toolName: block.name,
        input: block.input,
        timestamp: Date.now()
      }
    ]);

    // 목적: 파일 수정 도구에서 경로를 수집한다.
    const pathField = FILE_PATH_TOOLS[block.name];
    if (pathField && typeof block.input[pathField] === "string") {
      touchedFilesRef.current.add(block.input[pathField] as string);
    }
  }, []);

  // 목적: tool_result를 기존 타임라인 엔트리에 매칭한다.
  const handleToolResult = useCallback(
    (toolUseId: string, content: string) => {
      setToolTimeline((prev) =>
        prev.map((entry) =>
          entry.id === toolUseId
            ? { ...entry, result: content, completedAt: Date.now() }
            : entry
        )
      );
    },
    []
  );

  // 목적: stream-json 이벤트를 타입별로 분기 처리한다.
  const handleStreamEvent = useCallback(
    (event: StreamJsonEvent) => {
      if (event.type === "assistant") {
        for (const block of event.message.content) {
          if (block.type === "text") {
            setAssistantText((prev) => prev + block.text);
          } else if (block.type === "tool_use") {
            handleToolUse(block);
          }
        }
      } else if (event.type === "user") {
        for (const tr of event.message.content) {
          const preview =
            typeof tr.content === "string"
              ? tr.content
              : JSON.stringify(tr.content);
          handleToolResult(tr.tool_use_id, preview);
        }
      } else if (event.type === "result") {
        const result = event as StreamJsonResult;
        setCostUsd(result.cost_usd);
        setDurationMs(result.duration_ms);
      }
    },
    [handleToolUse, handleToolResult]
  );

  // 목적: onClaudeEvent 리스너를 등록하여 현재 요청의 이벤트만 처리한다.
  useEffect(() => {
    if (didSetupRef.current) return;
    didSetupRef.current = true;

    const unsub = window.atlas.onClaudeEvent((event: ClaudeEvent) => {
      if (event.requestId !== requestIdRef.current) return;

      if (event.phase === "stream-event") {
        handleStreamEvent(event.event as StreamJsonEvent);
      } else if (event.phase === "completed") {
        if (event.costUsd != null) setCostUsd(event.costUsd);
        if (event.durationMs != null) setDurationMs(event.durationMs);
        setStatus("completed");
      } else if (event.phase === "failed") {
        setErrorMessage(event.error);
        setStatus("failed");
      } else if (event.phase === "cancelled") {
        setStatus("cancelled");
      }
    });

    return () => {
      unsub();
      didSetupRef.current = false;
    };
  }, [handleStreamEvent]);

  const execute = useCallback(async (prompt: string, cwd?: string) => {
    const id = crypto.randomUUID();
    requestIdRef.current = id;
    touchedFilesRef.current = new Set();
    setToolTimeline([]);
    setAssistantText("");
    setCostUsd(null);
    setDurationMs(null);
    setErrorMessage(null);
    setStatus("running");

    const res = await window.atlas.runClaude({
      requestId: id,
      prompt: prompt.trim(),
      ...(cwd ? { cwd } : {})
    });

    if (res.status === "rejected") {
      setErrorMessage(res.message ?? "요청이 거부되었습니다.");
      setStatus("failed");
    }
  }, []);

  const cancel = useCallback(async () => {
    if (!requestIdRef.current) return;
    await window.atlas.cancelClaude({ requestId: requestIdRef.current });
  }, []);

  const reset = useCallback(() => {
    requestIdRef.current = null;
    touchedFilesRef.current = new Set();
    setToolTimeline([]);
    setAssistantText("");
    setCostUsd(null);
    setDurationMs(null);
    setErrorMessage(null);
    setStatus("idle");
  }, []);

  // 목적: 세션에서 Claude가 수정한 파일 경로 목록을 외부에서 조회할 수 있도록 노출한다.
  const getTouchedFiles = useCallback(() => [...touchedFilesRef.current], []);

  return {
    status,
    toolTimeline,
    assistantText,
    costUsd,
    durationMs,
    errorMessage,
    execute,
    cancel,
    reset,
    getTouchedFiles
  };
}
