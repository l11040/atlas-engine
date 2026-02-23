// 책임: Codex JSONL 이벤트를 정규화된 CliEvent 배열로 변환한다.
// 이유: stateless 변환은 item.started/item.completed 간 ID 불일치 문제를 야기하므로
//       상태 기반 normalizer로 구현한다.

import type { CliEvent } from "../../../../shared/ipc";
import type { CodexJsonlEvent } from "./jsonl-parser";

// 목적: item.started에서 발급한 ID를 추적하여 item.completed와 매칭한다.
interface StartedEntry {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
}

export function createCodexNormalizer() {
  // 주의: item.id 기준이 아닌 itemType 기준으로 최신 started를 추적한다.
  // Codex는 동일 타입의 도구가 순차 실행되므로 스택 기반 매칭이 적합하다.
  const startedStack = new Map<string, StartedEntry[]>();

  function pushStarted(itemType: string, entry: StartedEntry) {
    const stack = startedStack.get(itemType) ?? [];
    stack.push(entry);
    startedStack.set(itemType, stack);
  }

  function popStarted(itemType: string, itemId: string | undefined): StartedEntry | undefined {
    const stack = startedStack.get(itemType);
    if (!stack || stack.length === 0) return undefined;

    // 목적: item.id가 존재하면 정확히 매칭, 없으면 FIFO로 소비한다.
    if (itemId) {
      const idx = stack.findIndex((e) => e.id === itemId);
      if (idx >= 0) return stack.splice(idx, 1)[0];
    }
    return stack.shift();
  }

  // 목적: Codex file_change 이벤트의 changes 배열에서 파일 경로를 추출한다.
  function extractFilePaths(item: Record<string, unknown>): string {
    const changes = item.changes as Array<Record<string, unknown>> | undefined;
    if (changes && changes.length > 0) {
      return changes.map((c) => (c.path as string) ?? "").filter(Boolean).join(", ");
    }
    return (item.file_path as string) ?? "";
  }

  return function normalize(requestId: string, raw: CodexJsonlEvent): CliEvent[] {
    const base = { requestId, provider: "codex" as const, timestamp: Date.now() };
    const events: CliEvent[] = [];
    const type = raw.type as string | undefined;
    const item = raw.item as Record<string, unknown> | undefined;

    if (type === "item.started" && item) {
      const itemType = item.type as string | undefined;

      // 주의: Codex CLI는 "command_execution"을 사용하며 구버전은 "command"를 사용한다.
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
        const filePath = extractFilePaths(item);
        pushStarted("file_change", { id, toolName: "Edit", input: { file_path: filePath } });
        events.push({
          ...base,
          phase: "tool-use",
          tool: { id, name: "Edit", input: { file_path: filePath } }
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
        // 주의: Codex CLI는 출력을 "aggregated_output"에 넣으며 구버전은 "output"을 사용한다.
        const output = (item.aggregated_output as string) ?? (item.output as string) ?? "";

        if (started) {
          // 목적: started에서 발급한 ID로 tool-result를 매칭한다.
          events.push({
            ...base,
            phase: "tool-result",
            toolResult: { toolUseId: started.id, content: output }
          });
        } else {
          // 주의: item.started 없이 item.completed만 수신된 경우
          // tool-use와 tool-result를 동시에 발행하여 타임라인 누락을 방지한다.
          const id = (itemId as string) ?? crypto.randomUUID();
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
        const filePath = extractFilePaths(item);

        if (started) {
          events.push({
            ...base,
            phase: "tool-result",
            toolResult: { toolUseId: started.id, content: `File changed: ${filePath}` }
          });
        } else {
          const id = (itemId as string) ?? crypto.randomUUID();
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
      // 이유: reasoning 타입은 내부 추론 과정이므로 무시한다.
    } else if (type === "turn.completed") {
      const usage = raw.usage as Record<string, unknown> | undefined;
      if (usage) {
        events.push({
          ...base,
          phase: "result",
          result: {
            numTurns: 1
            // 이유: Codex JSONL은 비용 정보를 직접 제공하지 않는다.
          }
        });
      }
    }

    return events;
  };
}
