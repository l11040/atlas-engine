// 책임: Claude CLI stream-json stdout을 줄 단위로 버퍼링하여 파싱된 이벤트를 콜백으로 전달한다.

import type { StreamJsonEvent } from "../../../shared/ipc";

export type StreamJsonCallback = (event: StreamJsonEvent) => void;
export type ParseErrorCallback = (rawLine: string, error: Error) => void;

export function createStreamJsonParser(
  onEvent: StreamJsonCallback,
  onError?: ParseErrorCallback
) {
  let buffer = "";

  function feed(chunk: string): void {
    buffer += chunk;
    // 목적: 개행 문자로 분리하여 완성된 JSON 줄만 파싱한다.
    const lines = buffer.split("\n");
    // 주의: 마지막 요소는 불완전한 줄일 수 있으므로 버퍼에 보존한다.
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

  // 목적: 프로세스 종료 시 버퍼에 남은 마지막 줄을 처리한다.
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
