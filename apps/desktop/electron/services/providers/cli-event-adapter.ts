// 책임: @atlas/cli-runtime 이벤트를 IPC 이벤트로 명시적으로 변환한다.

import type { CliEvent as RuntimeCliEvent } from "@atlas/cli-runtime";
import type { CliEvent as IpcCliEvent } from "../../../shared/ipc";

// 목적: 런타임/IPC 이벤트 모델 결합도를 낮추기 위해 명시적 adapter를 둔다.
export function toIpcCliEvent(event: RuntimeCliEvent): IpcCliEvent {
  switch (event.phase) {
    case "started":
      return {
        requestId: event.requestId,
        provider: event.provider,
        phase: "started",
        pid: event.pid,
        timestamp: event.timestamp
      };
    case "text":
      return {
        requestId: event.requestId,
        provider: event.provider,
        phase: "text",
        text: event.text,
        timestamp: event.timestamp
      };
    case "tool-use":
      return {
        requestId: event.requestId,
        provider: event.provider,
        phase: "tool-use",
        tool: event.tool,
        timestamp: event.timestamp
      };
    case "tool-result":
      return {
        requestId: event.requestId,
        provider: event.provider,
        phase: "tool-result",
        toolResult: event.toolResult,
        timestamp: event.timestamp
      };
    case "result":
      return {
        requestId: event.requestId,
        provider: event.provider,
        phase: "result",
        result: event.result,
        timestamp: event.timestamp
      };
    case "parse-error":
      return {
        requestId: event.requestId,
        provider: event.provider,
        phase: "parse-error",
        rawLine: event.rawLine,
        error: event.error,
        timestamp: event.timestamp
      };
    case "stderr":
      return {
        requestId: event.requestId,
        provider: event.provider,
        phase: "stderr",
        chunk: event.chunk,
        timestamp: event.timestamp
      };
    case "completed":
      return {
        requestId: event.requestId,
        provider: event.provider,
        phase: "completed",
        exitCode: event.exitCode,
        signal: event.signal,
        timestamp: event.timestamp
      };
    case "failed":
      return {
        requestId: event.requestId,
        provider: event.provider,
        phase: "failed",
        error: event.error,
        timestamp: event.timestamp
      };
    case "cancelled":
      return {
        requestId: event.requestId,
        provider: event.provider,
        phase: "cancelled",
        timestamp: event.timestamp
      };
  }
}
