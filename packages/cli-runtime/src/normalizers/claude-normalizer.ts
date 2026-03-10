// 책임: Claude stream-json 이벤트를 정규화된 CliEvent 배열로 변환한다.

import type { CliEvent, StreamJsonEvent } from "../types";

// 목적: stream_event 내부의 Anthropic API 스트리밍 이벤트에서 텍스트 델타를 추출한다.
function extractStreamEventText(inner: Record<string, unknown>): string | null {
  const eventType = inner.type as string;

  if (eventType === "content_block_delta") {
    const delta = inner.delta as Record<string, unknown> | undefined;
    if (delta?.type === "text_delta" && typeof delta.text === "string") {
      return delta.text;
    }
    if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
      return delta.partial_json;
    }
  }

  // 목적: content_block_start에서 tool_use 블록 시작을 표시한다.
  if (eventType === "content_block_start") {
    const cb = inner.content_block as Record<string, unknown> | undefined;
    if (cb?.type === "tool_use" && typeof cb.name === "string") {
      return `🔧 도구 호출 시작: ${cb.name}`;
    }
  }

  // 이유: message_start, message_delta, message_stop, content_block_stop은 노이즈이므로 무시한다.
  return null;
}

export function normalizeClaudeStreamJsonEvent(requestId: string, raw: StreamJsonEvent): CliEvent[] {
  const base = { requestId, provider: "claude" as const, timestamp: Date.now() };
  const events: CliEvent[] = [];

  if (raw.type === "stream_event") {
    // 목적: --include-partial-messages 사용 시 토큰 단위 스트리밍 이벤트를 처리한다.
    const text = extractStreamEventText(raw.event as Record<string, unknown>);
    if (text) {
      events.push({ ...base, phase: "text", text });
    }
  } else if (raw.type === "system") {
    events.push({ ...base, phase: "text", text: `[session:${raw.session_id}] CLI 세션 초기화됨 (도구 ${raw.tools.length}개)` });
  } else if (raw.type === "assistant") {
    // 주의: --include-partial-messages 사용 시 assistant 메시지는 stream_event 이후 최종 확인용으로 온다.
    // 이미 stream_event에서 텍스트를 전달했으므로, 도구 호출만 추출한다.
    for (const block of raw.message.content) {
      if (block.type === "tool_use") {
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
