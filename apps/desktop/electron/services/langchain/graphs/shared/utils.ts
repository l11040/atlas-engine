// 책임: 서브그래프 간 공유 유틸리티 함수를 제공한다.

import type { ActivityLogEntry, CliEvent, TerminalLog, ToolTimelineEntry } from "../../../../../shared/ipc";

// 목적: 타임스탬프를 포함한 활동 로그 엔트리를 생성한다.
export function logEntry(message: string, type: ActivityLogEntry["type"] = "info"): ActivityLogEntry {
  return { timestamp: Date.now(), message, type };
}

// 목적: LLM 응답에서 JSON 블록을 추출한다.
// 이유: CLI 에이전트가 자연어+JSON 혼합 응답을 반환하므로, 여러 패턴을 시도하여 JSON을 추출한다.
export function extractJson(text: string): string {
  // 1순위: 마지막 ```json ... ``` 코드 펜스 (에이전트가 설명 후 JSON을 출력하는 패턴)
  const fenceMatches = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
  if (fenceMatches.length > 0) {
    const lastFence = fenceMatches[fenceMatches.length - 1]![1]!.trim();
    if (lastFence.startsWith("{") || lastFence.startsWith("[")) return lastFence;
  }

  // 2순위: 가장 긴 { ... } 또는 [ ... ] 블록 (자연어 사이에 JSON이 섞인 패턴)
  const braceMatches = [...text.matchAll(/\{[\s\S]*?\}(?=\s*(?:$|[^{]))/g)];
  if (braceMatches.length > 0) {
    // 목적: 가장 긴 매치를 선택한다 (중첩 JSON일 가능성이 높다).
    let best = braceMatches[0]![0];
    for (const m of braceMatches) {
      if (m[0].length > best.length) best = m[0];
    }
    // 주의: 유효한 JSON인지 사전 검증한다.
    try {
      JSON.parse(best);
      return best;
    } catch {
      // 탐욕적 매칭 재시도
    }
  }

  // 3순위: 탐욕적 { ... } 매칭 (전체 텍스트에서)
  const greedyMatch = text.match(/\{[\s\S]*\}/);
  if (greedyMatch) {
    try {
      JSON.parse(greedyMatch[0]);
      return greedyMatch[0];
    } catch {
      // 유효하지 않으면 통과
    }
  }

  // 4순위: [ ... ] 배열 매칭
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      JSON.parse(arrayMatch[0]);
      return arrayMatch[0];
    } catch {
      // 유효하지 않으면 통과
    }
  }

  return text.trim();
}

// 목적: CLI 이벤트 배열을 노드 카드에 표시할 터미널 로그 구조로 변환한다.
export function buildTerminalLogFromEvents(events: CliEvent[], fallbackError?: string): TerminalLog {
  const toolTimeline: ToolTimelineEntry[] = [];
  const toolMap = new Map<string, number>();
  const textChunks: string[] = [];
  const stderrChunks: string[] = [];
  let status: TerminalLog["status"] = "completed";
  let error = fallbackError;

  for (const event of events) {
    if (event.phase === "text") {
      textChunks.push(event.text);
      continue;
    }
    if (event.phase === "stderr") {
      stderrChunks.push(event.chunk);
      continue;
    }
    if (event.phase === "failed") {
      status = "failed";
      error = event.error;
      continue;
    }
    if (event.phase === "tool-use") {
      const idx = toolTimeline.length;
      toolTimeline.push({
        id: event.tool.id,
        toolName: event.tool.name,
        input: event.tool.input,
        timestamp: event.timestamp
      });
      toolMap.set(event.tool.id, idx);
      continue;
    }
    if (event.phase === "tool-result") {
      const idx = toolMap.get(event.toolResult.toolUseId);
      if (idx != null && toolTimeline[idx]) {
        toolTimeline[idx] = {
          ...toolTimeline[idx]!,
          result: event.toolResult.content,
          completedAt: event.timestamp
        };
      }
      continue;
    }
  }

  if (fallbackError && !error) {
    status = "failed";
    error = fallbackError;
  }

  return {
    status,
    output: textChunks.join(""),
    stderr: stderrChunks.join(""),
    error,
    toolTimeline
  };
}
