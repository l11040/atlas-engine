// 책임: Claude stream-json 이벤트를 정규화된 CliEvent 배열로 변환한다.

import type { CliEvent, StreamJsonEvent } from "../../../../shared/ipc";

// 목적: 하나의 StreamJsonEvent를 0개 이상의 정규화된 CliEvent로 분해한다.
export function normalizeStreamJsonEvent(requestId: string, raw: StreamJsonEvent): CliEvent[] {
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
  // 이유: system init 이벤트는 UI에 전달할 정보가 없으므로 무시한다.

  return events;
}
