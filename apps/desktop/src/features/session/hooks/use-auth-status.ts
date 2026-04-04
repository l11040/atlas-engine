// 책임: CLI 인증 상태 조회를 관리한다. (기존 auth-status-card에서 분리)
import { useCallback, useEffect, useRef, useState } from "react";
import type { CliAuthStatus, ProviderType } from "@shared/ipc";

interface ProviderStatus {
  provider: ProviderType;
  label: string;
  state: "checking" | CliAuthStatus;
  message: string;
}

const PROVIDERS: { type: ProviderType; label: string }[] = [
  { type: "claude", label: "Claude CLI" },
  { type: "codex", label: "Codex CLI" }
];

export function useAuthStatus() {
  const [activeProvider, setActiveProvider] = useState<ProviderType>("claude");
  const [statuses, setStatuses] = useState<ProviderStatus[]>(
    PROVIDERS.map((p) => ({ provider: p.type, label: p.label, state: "checking", message: "" }))
  );
  const didInitRef = useRef(false);

  const checkAll = useCallback(async () => {
    setStatuses((prev) => prev.map((s) => ({ ...s, state: "checking" as const, message: "" })));

    const results = await Promise.allSettled(
      PROVIDERS.map((p) => window.atlas.getCliAuthStatus({ provider: p.type }))
    );

    setStatuses(
      PROVIDERS.map((p, i) => {
        const result = results[i]!;
        if (result.status === "fulfilled") {
          return { provider: p.type, label: p.label, state: result.value.status, message: result.value.message };
        }
        return {
          provider: p.type,
          label: p.label,
          state: "error" as const,
          message: result.reason instanceof Error ? result.reason.message : "알 수 없는 오류"
        };
      })
    );
  }, []);

  // 목적: 마운트 시 설정에서 기본 provider를 로드하고 인증 상태를 1회 조회한다.
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    window.atlas.getConfig().then((config) => setActiveProvider(config.activeProvider));
    void checkAll();
    return () => {
      didInitRef.current = false;
    };
  }, [checkAll]);

  const activeStatus = statuses.find((s) => s.provider === activeProvider);

  return { statuses, activeProvider, activeStatus, checkAll };
}
