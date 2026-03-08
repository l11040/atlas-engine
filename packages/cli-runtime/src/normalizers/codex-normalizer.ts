// 책임: Codex JSONL 이벤트를 정규화된 CliEvent 배열로 변환한다.
// 이유: item.started/item.completed를 상태 기반으로 매칭해 타임라인 ID 일관성을 유지한다.

import type { CliEvent } from "../types";
import type { CodexJsonlEvent } from "../parsers/jsonl-parser";

interface StartedEntry {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
}

export function createCodexNormalizer() {
  // 주의: 동일 타입 도구가 순차 실행된다는 전제를 기반으로 스택을 유지한다.
  const startedStack = new Map<string, StartedEntry[]>();

  function pushStarted(itemType: string, entry: StartedEntry) {
    const stack = startedStack.get(itemType) ?? [];
    stack.push(entry);
    startedStack.set(itemType, stack);
  }

  function popStarted(itemType: string, itemId: string | undefined): StartedEntry | undefined {
    const stack = startedStack.get(itemType);
    if (!stack || stack.length === 0) return undefined;

    if (itemId) {
      const idx = stack.findIndex((entry) => entry.id === itemId);
      if (idx >= 0) return stack.splice(idx, 1)[0];
    }

    return stack.shift();
  }

  function extractFilePaths(item: Record<string, unknown>): string[] {
    const changes = item.changes as Array<Record<string, unknown>> | undefined;
    if (changes && changes.length > 0) {
      const paths = changes
        .map((change) => (change.path as string) ?? "")
        .filter(Boolean);
      if (paths.length > 0) return paths;
    }
    const fallback = (item.file_path as string) ?? "";
    return fallback ? [fallback] : [];
  }

  return function normalize(requestId: string, raw: CodexJsonlEvent): CliEvent[] {
    const base = { requestId, provider: "codex" as const, timestamp: Date.now() };
    const events: CliEvent[] = [];
    const type = raw.type as string | undefined;
    const item = raw.item as Record<string, unknown> | undefined;

    if (type === "item.started" && item) {
      const itemType = item.type as string | undefined;

      if (itemType === "command_execution" || itemType === "command") {
        const id = (item.id as string) ?? crypto.randomUUID();
        const command = (item.command as string) ?? "";
        pushStarted("command", { id, toolName: "Bash", input: { command } });
        events.push({
          ...base,
          phase: "tool-use",
          tool: { id, name: "Bash", input: { command } }
        });
      } else if (itemType === "file_change") {
        const id = (item.id as string) ?? crypto.randomUUID();
        const filePaths = extractFilePaths(item);
        const filePath = filePaths.join(", ");
        pushStarted("file_change", { id, toolName: "Edit", input: { file_path: filePath, file_paths: filePaths } });
        events.push({
          ...base,
          phase: "tool-use",
          tool: { id, name: "Edit", input: { file_path: filePath, file_paths: filePaths } }
        });
      }
    } else if (type === "item.completed" && item) {
      const itemType = item.type as string | undefined;

      if (itemType === "agent_message" || itemType === "message") {
        const text = (item.text as string) ?? "";
        if (text) {
          events.push({ ...base, phase: "text", text });
        }
      } else if (itemType === "command_execution" || itemType === "command") {
        const itemId = item.id as string | undefined;
        const started = popStarted("command", itemId);
        const output = (item.aggregated_output as string) ?? (item.output as string) ?? "";

        if (started) {
          events.push({
            ...base,
            phase: "tool-result",
            toolResult: { toolUseId: started.id, content: output }
          });
        } else {
          const id = itemId ?? crypto.randomUUID();
          const command = (item.command as string) ?? "";
          events.push({
            ...base,
            phase: "tool-use",
            tool: { id, name: "Bash", input: { command } }
          });
          events.push({
            ...base,
            phase: "tool-result",
            toolResult: { toolUseId: id, content: output }
          });
        }
      } else if (itemType === "file_change") {
        const itemId = item.id as string | undefined;
        const started = popStarted("file_change", itemId);
        const filePath = extractFilePaths(item).join(", ");

        if (started) {
          events.push({
            ...base,
            phase: "tool-result",
            toolResult: { toolUseId: started.id, content: `File changed: ${filePath}` }
          });
        } else {
          const id = itemId ?? crypto.randomUUID();
          events.push({
            ...base,
            phase: "tool-use",
            tool: { id, name: "Edit", input: { file_path: filePath } }
          });
          events.push({
            ...base,
            phase: "tool-result",
            toolResult: { toolUseId: id, content: `File changed: ${filePath}` }
          });
        }
      }
    } else if (type === "turn.completed") {
      const usage = raw.usage as Record<string, unknown> | undefined;
      if (usage) {
        events.push({
          ...base,
          phase: "result",
          result: {
            numTurns: 1
          }
        });
      }
    }

    return events;
  };
}
