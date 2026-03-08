// 책임: Codex CLI JSONL stdout을 줄 단위로 버퍼링하여 파싱된 이벤트를 전달한다.

export type CodexJsonlEvent = Record<string, unknown>;
export type JsonlCallback = (event: CodexJsonlEvent) => void;
export type JsonlErrorCallback = (rawLine: string, error: Error) => void;

export function createJsonlParser(onEvent: JsonlCallback, onError?: JsonlErrorCallback) {
  let buffer = "";

  function feed(chunk: string): void {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as CodexJsonlEvent;
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
      const parsed = JSON.parse(trimmed) as CodexJsonlEvent;
      onEvent(parsed);
    } catch (e) {
      onError?.(trimmed, e instanceof Error ? e : new Error(String(e)));
    }
  }

  return { feed, flush };
}
