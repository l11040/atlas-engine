// 책임: CLI 실행 세션의 상태·타임라인·결과를 provider에 관계없이 관리한다.

import { useCallback, useEffect, useRef, useState } from "react";
import type { CliConversationOptions, CliEvent, ProviderType } from "@shared/ipc";

export type SessionStatus = "idle" | "running" | "completed" | "failed" | "cancelled";

export interface ToolTimelineEntry {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  result?: string;
  timestamp: number;
  completedAt?: number;
}

// 목적: tool-use 이벤트에서 파일 경로를 추출하는 도구 목록과 필드 매핑
const FILE_PATH_TOOLS: Record<string, string> = {
  Read: "file_path",
  Write: "file_path",
  Edit: "file_path",
  MultiEdit: "file_path"
};

export function useCliSession(defaultProvider: ProviderType = "claude") {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [toolTimeline, setToolTimeline] = useState<ToolTimelineEntry[]>([]);
  const [assistantText, setAssistantText] = useState("");
  const [costUsd, setCostUsd] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [parseErrorCount, setParseErrorCount] = useState(0);

  const requestIdRef = useRef<string | null>(null);
  const touchedFilesRef = useRef<Set<string>>(new Set());
  // 이유: React Strict Mode에서 effect 중복 등록을 방지한다.
  const didSetupRef = useRef(false);

  // 목적: onCliEvent 리스너를 등록하여 현재 요청의 이벤트만 처리한다.
  useEffect(() => {
    if (didSetupRef.current) return;
    didSetupRef.current = true;

    const unsub = window.atlas.onCliEvent((event: CliEvent) => {
      if (event.requestId !== requestIdRef.current) return;

      switch (event.phase) {
        case "text":
          setAssistantText((prev) => prev + event.text);
          break;
        case "tool-use": {
          setToolTimeline((prev) => [
            ...prev,
            { id: event.tool.id, toolName: event.tool.name, input: event.tool.input, timestamp: event.timestamp }
          ]);
          // 목적: 파일 수정 도구에서 경로를 수집한다.
          const pathField = FILE_PATH_TOOLS[event.tool.name];
          if (pathField && typeof event.tool.input[pathField] === "string") {
            const raw = event.tool.input[pathField] as string;
            const explicitList = event.tool.input.file_paths;
            if (Array.isArray(explicitList)) {
              for (const path of explicitList) {
                if (typeof path === "string" && path.trim()) {
                  touchedFilesRef.current.add(path.trim());
                }
              }
            } else {
              // 주의: Codex file_change는 다중 경로를 \", \"로 합쳐 보낼 수 있어 분해한다.
              for (const path of raw.split(",").map((part) => part.trim()).filter(Boolean)) {
                touchedFilesRef.current.add(path);
              }
            }
          }
          break;
        }
        case "tool-result":
          setToolTimeline((prev) =>
            prev.map((entry) =>
              entry.id === event.toolResult.toolUseId
                ? { ...entry, result: event.toolResult.content, completedAt: Date.now() }
                : entry
            )
          );
          break;
        case "result":
          if (event.result.costUsd != null) setCostUsd(event.result.costUsd);
          if (event.result.durationMs != null) setDurationMs(event.result.durationMs);
          break;
        case "parse-error":
          setParseErrorCount((prev) => prev + 1);
          break;
        case "completed":
          setStatus("completed");
          break;
        case "failed":
          setErrorMessage(event.error);
          setStatus("failed");
          break;
        case "cancelled":
          setStatus("cancelled");
          break;
      }
    });

    return () => {
      unsub();
      didSetupRef.current = false;
    };
  }, []);

  const execute = useCallback(
    async (prompt: string, cwd?: string, provider?: ProviderType, conversation?: CliConversationOptions) => {
      const id = crypto.randomUUID();
      requestIdRef.current = id;
      touchedFilesRef.current = new Set();
      setToolTimeline([]);
      setAssistantText("");
      setCostUsd(null);
      setDurationMs(null);
      setErrorMessage(null);
      setParseErrorCount(0);
      setStatus("running");

      const res = await window.atlas.runCli({
        requestId: id,
        provider: provider ?? defaultProvider,
        prompt: prompt.trim(),
        ...(cwd ? { cwd } : {}),
        ...(conversation ? { conversation } : {})
      });

      if (res.status === "rejected") {
        setErrorMessage(res.message ?? "요청이 거부되었습니다.");
        setStatus("failed");
      }
    },
    [defaultProvider]
  );

  const cancel = useCallback(async () => {
    if (!requestIdRef.current) return;
    await window.atlas.cancelCli({ requestId: requestIdRef.current });
  }, []);

  const reset = useCallback(() => {
    requestIdRef.current = null;
    touchedFilesRef.current = new Set();
    setToolTimeline([]);
    setAssistantText("");
    setCostUsd(null);
    setDurationMs(null);
    setErrorMessage(null);
    setParseErrorCount(0);
    setStatus("idle");
  }, []);

  // 목적: 세션에서 CLI가 수정한 파일 경로 목록을 외부에서 조회할 수 있도록 노출한다.
  const getTouchedFiles = useCallback(() => [...touchedFilesRef.current], []);

  return {
    status,
    toolTimeline,
    assistantText,
    costUsd,
    durationMs,
    errorMessage,
    parseErrorCount,
    execute,
    cancel,
    reset,
    getTouchedFiles
  };
}
