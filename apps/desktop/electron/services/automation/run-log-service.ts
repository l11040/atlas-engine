import type { CliEvent } from "@atlas/cli-runtime";
import type { RunLogEntry, RunStep, ToolTimelineEntry } from "../../../shared/ipc";
import { getRunState, saveRunState } from "./run-state-store";

const MAX_RUN_LOGS = 800;
const MAX_TOOL_TIMELINE = 400;

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

function summarizeEvent(event: CliEvent): string | null {
  switch (event.phase) {
    case "started":
      return `CLI started (pid=${event.pid})`;
    case "tool-use":
      return `tool-use: ${event.tool.name}`;
    case "tool-result":
      return `tool-result: ${event.toolResult.toolUseId}`;
    case "stderr":
      return `stderr: ${event.chunk.slice(0, 200)}`;
    case "parse-error":
      return `parse-error: ${event.error}`;
    case "result":
      return `result: duration=${event.result.durationMs ?? "?"}ms cost=${event.result.costUsd ?? "?"}`;
    case "completed":
      return `CLI completed (exit=${event.exitCode})`;
    case "failed":
      return `CLI failed: ${event.error}`;
    case "cancelled":
      return "CLI cancelled";
    case "text":
      return event.text.trim() ? `text: ${event.text.slice(0, 200)}` : null;
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
  const message = summarizeEvent(event);
  const nodeLabel = taskId ? `${taskId}:${node}` : node;
  const level: RunLogEntry["level"] =
    event.phase === "failed" || event.phase === "parse-error" ? "error" : "info";

  state.toolTimeline = appendToolTimelineFromEvent(event, state.toolTimeline ?? []);

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
