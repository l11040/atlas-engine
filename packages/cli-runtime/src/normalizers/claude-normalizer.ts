// 책임: Claude stream-json 이벤트를 정규화된 CliEvent 배열로 변환한다.

import type { CliEvent, StreamJsonEvent } from "../types";

export function normalizeClaudeStreamJsonEvent(requestId: string, raw: StreamJsonEvent): CliEvent[] {
  const base = { requestId, provider: "claude" as const, timestamp: Date.now() };
  const events: CliEvent[] = [];

  if (raw.type === "assistant") {
    for (const block of raw.message.content) {
      if (block.type === "text") {
        events.push({ ...base, phase: "text", text: block.text });
      } else if (block.type === "tool_use") {
        events.push({
          ...base,
          phase: "tool-use",
          tool: { id: block.id, name: block.name, input: block.input }
        });
      }
    }
  } else if (raw.type === "user") {
    for (const tr of raw.message.content) {
      const preview = typeof tr.content === "string" ? tr.content : JSON.stringify(tr.content);
      events.push({
        ...base,
        phase: "tool-result",
        toolResult: { toolUseId: tr.tool_use_id, content: preview }
      });
    }
  } else if (raw.type === "result") {
    events.push({
      ...base,
      phase: "result",
      result: {
        costUsd: raw.cost_usd,
        durationMs: raw.duration_ms,
        numTurns: raw.num_turns
      }
    });
  }

  return events;
}
