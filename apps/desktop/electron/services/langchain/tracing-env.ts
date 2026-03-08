// 책임: LangSmith 추적용 환경 변수를 설정·해제한다.

import type { TracingSettings } from "../../../shared/ipc";

const TRACING_ENV_KEYS = [
  "LANGCHAIN_TRACING_V2",
  "LANGCHAIN_API_KEY",
  "LANGCHAIN_PROJECT",
  "LANGCHAIN_ENDPOINT"
] as const;

// 목적: 설정에 기반하여 LangSmith 환경 변수를 주입한다.
// 이유: 빈 값은 설정하지 않아 시스템 환경 변수가 폴백으로 작동하도록 한다.
export function applyTracingEnv(tracing?: TracingSettings): void {
  if (!tracing?.enabled) {
    // 목적: 비활성 상태에서는 환경 변수를 제거하여 이전 실행의 잔류값을 방지한다.
    for (const key of TRACING_ENV_KEYS) {
      delete process.env[key];
    }
    return;
  }

  process.env.LANGCHAIN_TRACING_V2 = "true";

  if (tracing.apiKey) {
    process.env.LANGCHAIN_API_KEY = tracing.apiKey;
  }
  if (tracing.project) {
    process.env.LANGCHAIN_PROJECT = tracing.project;
  }
  if (tracing.endpoint) {
    process.env.LANGCHAIN_ENDPOINT = tracing.endpoint;
  }
}

// 목적: 플로우 종료 후 환경 변수를 제거한다.
export function clearTracingEnv(): void {
  for (const key of TRACING_ENV_KEYS) {
    delete process.env[key];
  }
}
