import type { CliEvent } from "@atlas/cli-runtime";
import type { RunLogEntry, RunStep, ToolTimelineEntry } from "../../../shared/ipc";
import { getRunState, saveRunState } from "./run-state-store";

const MAX_RUN_LOGS = 800;
const MAX_TOOL_TIMELINE = 400;
// 주의: 스트리밍 텍스트 버퍼의 최대 문자 수. 이 이상은 앞부분을 잘라낸다.
const MAX_STREAM_TEXT = 4000;

export function appendRunLogEntry(entry: Omit<RunLogEntry, "timestamp"> & { timestamp?: number }): void {
  const state = getRunState();
  if (!state) return;

  const nextEntry: RunLogEntry = {
    ...entry,
    timestamp: entry.timestamp ?? Date.now()
  };

  state.logs = [...(state.logs ?? []), nextEntry].slice(-MAX_RUN_LOGS);
  saveRunState(state);
}

// 목적: 노드별 스트리밍 텍스트를 누적하여 단일 로그 항목으로 관리한다.
const streamBuffers = new Map<string, { logIndex: number; text: string }>();

// 목적: 특정 노드의 스트리밍 버퍼를 초기화한다. 노드 실행 완료 시 호출.
function flushStreamBuffer(nodeKey: string): void {
  streamBuffers.delete(nodeKey);
}

// 목적: 스트리밍 텍스트 토큰을 노드별 단일 로그 항목에 누적한다.
function appendStreamText(state: { logs: RunLogEntry[] }, nodeKey: string, step: RunStep | "system", nodeLabel: string, text: string, timestamp: number): void {
  const buf = streamBuffers.get(nodeKey);

  if (buf != null && buf.logIndex < state.logs.length) {
    // 이유: 기존 로그 항목의 message를 직접 갱신하여 항목 수 증가를 방지한다.
    buf.text += text;
    if (buf.text.length > MAX_STREAM_TEXT) {
      buf.text = buf.text.slice(-MAX_STREAM_TEXT);
    }
    state.logs[buf.logIndex] = {
      ...state.logs[buf.logIndex]!,
      message: buf.text,
      timestamp
    };
    return;
  }

  // 목적: 새 스트리밍 로그 항목을 생성한다.
  const newEntry: RunLogEntry = {
    timestamp,
    level: "info",
    step,
    node: nodeLabel,
    message: text
  };
  state.logs = [...state.logs, newEntry].slice(-MAX_RUN_LOGS);
  streamBuffers.set(nodeKey, { logIndex: state.logs.length - 1, text });
}

// 목적: CliEvent를 사람이 읽기 쉬운 로그 메시지로 변환한다. text phase는 별도 처리.
function summarizeEvent(event: CliEvent): string | null {
  switch (event.phase) {
    case "started":
      return `CLI 프로세스 시작 (pid=${event.pid})`;
    case "text":
      // 이유: text phase는 appendStreamText에서 누적 처리하므로 여기서는 null을 반환한다.
      return null;
    case "tool-use":
      return `🔧 도구 호출: ${event.tool.name}\n입력: ${JSON.stringify(event.tool.input, null, 2)}`;
    case "tool-result": {
      const content = event.toolResult.content;
      const preview = content.length > 2000
        ? content.slice(0, 2000) + `\n... (총 ${content.length}자)`
        : content;
      return `📋 도구 결과 (${event.toolResult.toolUseId}):\n${preview}`;
    }
    case "stderr":
      return event.chunk.trim() ? `stderr: ${event.chunk.trim()}` : null;
    case "parse-error":
      return `파싱 오류: ${event.error}`;
    case "result":
      return `실행 완료: ${event.result.durationMs ?? "?"}ms, 비용 $${event.result.costUsd ?? "?"}, ${event.result.numTurns ?? "?"}턴`;
    case "completed":
      return `CLI 프로세스 종료 (exit=${event.exitCode})`;
    case "failed":
      return `CLI 실패: ${event.error}`;
    case "cancelled":
      return "CLI 취소됨";
    default:
      return null;
  }
}

function appendToolTimelineFromEvent(event: CliEvent, stateToolTimeline: ToolTimelineEntry[]): ToolTimelineEntry[] {
  if (event.phase === "tool-use") {
    const next: ToolTimelineEntry = {
      id: event.tool.id,
      toolName: event.tool.name,
      input: event.tool.input,
      timestamp: event.timestamp
    };
    return [...stateToolTimeline, next].slice(-MAX_TOOL_TIMELINE);
  }

  if (event.phase === "tool-result") {
    return stateToolTimeline.map((entry) =>
      entry.id === event.toolResult.toolUseId
        ? { ...entry, result: event.toolResult.content, completedAt: event.timestamp }
        : entry
    );
  }

  return stateToolTimeline;
}

export function appendRunCliEvent(params: {
  step: RunStep | "system";
  node: string;
  event: CliEvent;
  taskId?: string;
}): void {
  const state = getRunState();
  if (!state) return;

  const { step, node, event, taskId } = params;
  const nodeLabel = taskId ? `${taskId}:${node}` : node;
  const nodeKey = `${step}/${nodeLabel}`;
  const level: RunLogEntry["level"] =
    event.phase === "failed" || event.phase === "parse-error" ? "error" : "info";

  state.toolTimeline = appendToolTimelineFromEvent(event, state.toolTimeline ?? []);

  // 목적: text phase는 노드별 단일 항목에 누적하여 실시간 스트리밍 효과를 낸다.
  if (event.phase === "text" && event.text.trim()) {
    appendStreamText(state, nodeKey, step, nodeLabel, event.text, event.timestamp);
    saveRunState(state);
    return;
  }

  // 목적: 완료/실패 이벤트 시 스트리밍 버퍼를 정리한다.
  if (event.phase === "completed" || event.phase === "failed" || event.phase === "cancelled" || event.phase === "result") {
    flushStreamBuffer(nodeKey);
  }

  const message = summarizeEvent(event);
  if (message) {
    state.logs = [
      ...(state.logs ?? []),
      {
        timestamp: event.timestamp,
        level,
        step,
        node: nodeLabel,
        message
      }
    ].slice(-MAX_RUN_LOGS);
  }

  saveRunState(state);
}
