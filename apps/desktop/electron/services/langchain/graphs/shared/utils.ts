// 책임: 서브그래프 간 공유 유틸리티 함수를 제공한다.

import type { ActivityLogEntry } from "../../../../../shared/ipc";

// 목적: 타임스탬프를 포함한 활동 로그 엔트리를 생성한다.
export function logEntry(message: string, type: ActivityLogEntry["type"] = "info"): ActivityLogEntry {
  return { timestamp: Date.now(), message, type };
}

// 목적: LLM 응답에서 JSON 블록을 추출한다.
export function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  const braceMatch = text.match(/[\[{][\s\S]*[\]}]/);
  if (braceMatch) return braceMatch[0].trim();
  return text.trim();
}
