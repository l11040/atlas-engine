// 책임: ProviderType으로 CliProvider 구현체를 조회한다.

import type { ProviderType } from "../../../shared/ipc";
import type { CliProvider } from "./types";
import { claudeProvider } from "./claude/claude-provider";
import { codexProvider } from "./codex/codex-provider";

const providers = new Map<ProviderType, CliProvider>([
  ["claude", claudeProvider],
  ["codex", codexProvider]
]);

export function getProvider(type: ProviderType): CliProvider {
  const provider = providers.get(type);
  if (!provider) {
    throw new Error(`Unknown CLI provider: ${type}`);
  }
  return provider;
}
