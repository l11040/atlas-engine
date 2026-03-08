// 책임: Claude CLI stream-json stdout을 줄 단위로 버퍼링하여 파싱된 이벤트를 전달한다.

import type { StreamJsonEvent } from "../types";

export type StreamJsonCallback = (event: StreamJsonEvent) => void;
export type ParseErrorCallback = (rawLine: string, error: Error) => void;

export function createStreamJsonParser(onEvent: StreamJsonCallback, onError?: ParseErrorCallback) {
  let buffer = "";

  function feed(chunk: string): void {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as StreamJsonEvent;
        onEvent(parsed);
      } catch (e) {
        onError?.(trimmed, e instanceof Error ? e : new Error(String(e)));
      }
    }
  }

  function flush(): void {
    const trimmed = buffer.trim();
    buffer = "";
    if (!trimmed) return;

    try {
      const parsed = JSON.parse(trimmed) as StreamJsonEvent;
      onEvent(parsed);
    } catch (e) {
      onError?.(trimmed, e instanceof Error ? e : new Error(String(e)));
    }
  }

  return { feed, flush };
}
